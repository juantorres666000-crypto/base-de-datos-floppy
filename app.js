// === FIREBASE ===
// Asegúrate de incluir los scripts de Firebase y la config en tu index.html antes que este archivo.
// Ejemplo en tu index.html:
//
// <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js"></script>
// <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js"></script>
// <script>
//   const firebaseConfig = { ... /* TU CONFIG */ };
//   firebase.initializeApp(firebaseConfig);
//   const db = firebase.firestore();
// </script>
// <script src="app.js"></script>

// --- Estado global ----
let clients = []; // Cada item será: {id, name, phone, email, orders:[], stamps:[], ...}
let editIndex = null;
let deleteIndex = null;

let orderMode = 'add';
let currentClientIdx = null, currentClientId = null;
let editOrderIdx = null, editOrderId = null;
let deleteOrderIdx = null, deleteOrderId = null;

// ---- === CLIENTES === ---- //
function listenClientsRealtime() {
    db.collection('clientes').onSnapshot(snapshot => {
        clients = [];
        snapshot.forEach(doc => {
            let data = doc.data();
            data.id = doc.id;
            if (!data.orders) data.orders = [];
            clients.push(data);
        });
        renderClients();
    });
}
// add/update/delete: usan la colección 'clientes' y sus docs
async function saveClientToFirebase(cliente, clienteId=null) {
    if(clienteId) {
        await db.collection('clientes').doc(clienteId).update(cliente);
    } else {
        const docRef = await db.collection('clientes').add(cliente);
        return docRef.id;
    }
}
async function deleteClientFromFirebase(clienteId) {
    // Borra cliente y todos los pedidos
    const ordersSnapshot = await db.collection('clientes').doc(clienteId).collection('orders').get();
    const batch = db.batch();
    ordersSnapshot.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    await db.collection('clientes').doc(clienteId).delete();
}

// ---- === PEDIDOS === ---- //
function listenOrdersRealtime(clienteId, callback) {
    db.collection('clientes').doc(clienteId).collection('orders').orderBy('numero').onSnapshot(snapshot => {
        let orders = [];
        snapshot.forEach(doc => orders.push({...doc.data(), id: doc.id}));
        callback(orders);
    });
}
async function saveOrderToFirebase(clienteId, order, orderId=null) {
    const ordersRef = db.collection('clientes').doc(clienteId).collection('orders');
    if(orderId)
        await ordersRef.doc(orderId).update(order);
    else
        await ordersRef.add(order);
}
async function deleteOrderFromFirebase(clienteId, orderId) {
    await db.collection('clientes').doc(clienteId).collection('orders').doc(orderId).delete();
}

// === RENDER CLIENTES ===
function renderClients() {
    const clientsList = document.getElementById('clientsList');
    clientsList.innerHTML = '';
    if (clients.length === 0) {
        clientsList.innerHTML = '<p style="opacity:.6; margin-top:2em">No hay clientes registrados aún.</p>';
        return;
    }
    clients.forEach((client, idx) => {
        const div = document.createElement('div');
        div.className = 'client-card neon-glow';
        div.innerHTML = `
            <h3>${client.name}</h3>
            <p><span>📞</span> ${client.phone}</p>
            <p><span>✉️</span> ${client.email}</p>
            <div class="client-actions">
                <button class="neon-btn-sm" onclick="showEditClient(${idx})">Editar</button>
                <button class="neon-btn-sm outline" onclick="showDeleteClient(${idx})">Eliminar</button>
                <button class="neon-btn-sm" onclick="showClientOrders(${idx})">Ver Detalles</button>
                <button class="neon-btn-sm outline" onclick="window.open('https://wa.me/${client.phone.replace(/[^0-9]/g, '')}','_blank')">WhatsApp</button>
            </div>
        `;
        clientsList.appendChild(div);
    });
}

// ---- MODALS LOGIC ----
// Cliente
const modalBg = document.getElementById('modalBg');
const addClientBtn = document.getElementById('addClientBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const clientForm = document.getElementById('clientForm');
const modalTitle = document.getElementById('modalTitle');
const saveClientBtn = document.getElementById('saveClientBtn');
const deleteModalBg = document.getElementById('deleteModalBg');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

// AGREGAR CLIENTE
addClientBtn.onclick = () => {
    editIndex = null;
    editClientId = null;
    modalTitle.textContent = "Agregar Cliente";
    saveClientBtn.textContent = "Agregar";
    clientForm.reset();
    modalBg.classList.add('active');
    document.getElementById('clientName').focus();
};
closeModalBtn.onclick = () => modalBg.classList.remove('active');
modalBg.onclick = function(e) { if (e.target === modalBg) modalBg.classList.remove('active'); }

// EDITAR CLIENTE
window.showEditClient = idx => {
    editIndex = idx;
    modalTitle.textContent = "Editar Cliente";
    saveClientBtn.textContent = "Guardar";
    document.getElementById('clientName').value = clients[idx].name;
    document.getElementById('clientPhone').value = clients[idx].phone;
    document.getElementById('clientEmail').value = clients[idx].email;
    modalBg.classList.add('active');
    document.getElementById('clientName').focus();
};

clientForm.onsubmit = async function(e) {
    e.preventDefault();
    const name = document.getElementById('clientName').value.trim();
    const phone = document.getElementById('clientPhone').value.trim();
    const email = document.getElementById('clientEmail').value.trim();
    if (!name || !phone || !email) return;
    const clienteData = { name, phone, email };
    if (editIndex !== null) {
        // Edición
        await saveClientToFirebase({...clients[editIndex], ...clienteData}, clients[editIndex].id);
    } else {
        await saveClientToFirebase({...clienteData, stamps:Array(10).fill(false)});
    }
    modalBg.classList.remove('active');
    editIndex = null;
};
// Eliminar cliente
window.showDeleteClient = idx => {
    deleteIndex = idx;
    deleteModalBg.classList.add('active');
};
cancelDeleteBtn.onclick = () => { deleteModalBg.classList.remove('active'); deleteIndex = null; }
confirmDeleteBtn.onclick = async () => {
    if (deleteIndex !== null) {
        await deleteClientFromFirebase(clients[deleteIndex].id);
    }
    deleteModalBg.classList.remove('active');
    deleteIndex = null;
};
deleteModalBg.onclick = function(e) { if (e.target === deleteModalBg) deleteModalBg.classList.remove('active'); };

// Navegación sidebar
document.querySelectorAll('.sidebar-nav li').forEach(item => {
    item.addEventListener('click', function() {
        document.querySelectorAll('.sidebar-nav li').forEach(e => e.classList.remove('active'));
        item.classList.add('active');
    });
});

// ---- PEDIDOS (ORDERS) PANEL LATERAL ----
const sidePanelBg = document.getElementById('sidePanelBg');
const sidePanel = document.getElementById('sidePanel');
const sidePanelTitle = document.getElementById('sidePanelTitle');
const closeSidePanel = document.getElementById('closeSidePanel');
const ordersList = document.getElementById('ordersList');
const addOrderBtn = document.getElementById('addOrderBtn');

// Abre panel pedidos y escucha en Firestore
window.showClientOrders = (idx) => {
    currentClientIdx = idx;
    let cli = clients[idx];
    currentClientId = cli.id;
    sidePanelTitle.textContent = `Pedidos de ${cli.name}`;
    listenOrdersRealtime(currentClientId, orders => {
        clients[currentClientIdx].orders = orders;
        renderOrders();
    });
    // Select fidelidad info!
    selectedClientForCard = idx;
    cardClientName.textContent = cli.name || '';
    tabOrders.classList.add('active');
    tabCard.classList.remove('active');
    clientOrdersSection.style.display='';
    clientCardSection.style.display='none';
    sidePanelBg.classList.add('active');
    sidePanel.scrollTop = 0;
    renderStampPicker();
};
closeSidePanel.onclick = () => sidePanelBg.classList.remove('active');
sidePanelBg.onclick = function(e) { if (e.target === sidePanelBg) sidePanelBg.classList.remove('active'); };

const modalOrderBg = document.getElementById('modalOrderBg');
const orderModalTitle = document.getElementById('orderModalTitle');
const orderForm = document.getElementById('orderForm');
const closeOrderModalBtn = document.getElementById('closeOrderModalBtn');
const saveOrderBtn = document.getElementById('saveOrderBtn');
const deleteOrderModalBg = document.getElementById('deleteOrderModalBg');
const cancelDeleteOrderBtn = document.getElementById('cancelDeleteOrderBtn');
const confirmDeleteOrderBtn = document.getElementById('confirmDeleteOrderBtn');

addOrderBtn.onclick = () => {
    orderMode = 'add';
    orderModalTitle.textContent = "Agregar Pedido";
    saveOrderBtn.textContent = "Agregar";
    orderForm.reset();
    modalOrderBg.classList.add('active');
    orderForm.orderInfo.focus();
};
closeOrderModalBtn.onclick = () => modalOrderBg.classList.remove('active');
modalOrderBg.onclick = function(e) { if (e.target === modalOrderBg) modalOrderBg.classList.remove('active'); }

// editar pedido
window.showEditOrder = idx => {
    orderMode = 'edit';
    const pedido = clients[currentClientIdx].orders[idx];
    editOrderIdx = idx;
    editOrderId = pedido.id;
    orderModalTitle.textContent = "Editar Pedido";
    saveOrderBtn.textContent = "Guardar";
    document.getElementById('orderInfo').value = pedido.info;
    document.getElementById('orderStart').value = pedido.start;
    document.getElementById('orderEnd').value = pedido.end;
    document.getElementById('orderPriceOwner').value = pedido.priceOwner;
    document.getElementById('orderPriceClient').value = pedido.priceClient;
    modalOrderBg.classList.add('active');
    orderForm.orderInfo.focus();
};

orderForm.onsubmit = async function(e) {
    e.preventDefault();
    const info = document.getElementById('orderInfo').value.trim();
    const start = document.getElementById('orderStart').value;
    const end = document.getElementById('orderEnd').value;
    const priceOwner = parseFloat(document.getElementById('orderPriceOwner').value);
    const priceClient = parseFloat(document.getElementById('orderPriceClient').value);
    if (!info || !start || !end || isNaN(priceOwner) || isNaN(priceClient)) return;
    if (orderMode === 'edit') {
        await saveOrderToFirebase(currentClientId, {info, start, end, priceOwner, priceClient}, editOrderId);
    } else {
        // El número de pedido es auto-generado (apilado)
        const clientOrders = clients[currentClientIdx].orders;
        const nextNumber = (clientOrders.length ? Math.max(...clientOrders.map(p=>p.numero||0)) + 1 : 1);
        await saveOrderToFirebase(currentClientId, {
            numero: nextNumber, info, start, end, priceOwner, priceClient
        });
    }
    modalOrderBg.classList.remove('active');
    editOrderIdx = null;
    editOrderId = null;
    orderMode = 'add';
};
// ELIMINAR pedido
window.showDeleteOrder = idx => {
    deleteOrderIdx = idx;
    deleteOrderId = clients[currentClientIdx].orders[idx].id;
    deleteOrderModalBg.classList.add('active');
};
cancelDeleteOrderBtn.onclick = () => { deleteOrderModalBg.classList.remove('active'); deleteOrderIdx = null; }
confirmDeleteOrderBtn.onclick = async () => {
    if (deleteOrderIdx !== null && deleteOrderId) {
        await deleteOrderFromFirebase(currentClientId, deleteOrderId);
    }
    deleteOrderModalBg.classList.remove('active');
    deleteOrderIdx = null;
    deleteOrderId = null;
};
deleteOrderModalBg.onclick = function(e) { if (e.target === deleteOrderModalBg) deleteOrderModalBg.classList.remove('active'); };

// ---- RENDERIZA PEDIDOS ----
function renderOrders() {
    const pedidos = clients[currentClientIdx]?.orders || [];
    ordersList.innerHTML = '';
    if (pedidos.length === 0) {
        ordersList.innerHTML = `<p style="opacity:.7; margin:2em auto; text-align:center;">No hay pedidos registrados.</p>`;
        return;
    }
    pedidos.forEach((order, i) => {
        const estado = calcularEstadoPedido(order);
        const dias = calcularDiasRestantes(order.end);
        ordersList.innerHTML += `
        <div class="order-card">
            <div class="order-header">
                <span class="order-num">#${order.numero}</span>
                <span class="order-state ${estado.class}">
                    ${estado.texto}
                </span>
            </div>
            <div class="order-info">
                <div><b>Perfil/PIN:</b> ${order.info}</div>
                <div><b>Inicio:</b> ${formateaFecha(order.start)} | <b>Fin:</b> ${formateaFecha(order.end)}</div>
                <div style="color:#fff9;"><b>Días restantes:</b> ${dias >= 0 ? dias : 0}</div>
                <div><span style="color:var(--neon-green)">Precio a ti:</span> $${order.priceOwner?.toFixed(2) || '0.00'}
                    <span style="margin-left:1.2em; color:var(--neon-blue);">Para cliente:</span> $${order.priceClient?.toFixed(2) || '0.00'}
                </div>
            </div>
            <div class="order-actions">
                <button class="neon-btn-sm" onclick="showEditOrder(${i})">Editar</button>
                <button class="neon-btn-sm outline" onclick="showDeleteOrder(${i})">Eliminar</button>
                <button class="neon-btn-sm outline" onclick="marcarPedidoVencido(${i})">Marcar vencido</button>
            </div>
        </div>
        `;
    });
}
window.marcarPedidoVencido = async function(idx) {
    const pedido = clients[currentClientIdx].orders[idx];
    if (window.confirm('¿Seguro que quieres marcar este pedido como vencido?')) {
        const ayer = new Date();
        ayer.setDate(ayer.getDate() - 1);
        pedido.end = ayer.toISOString().split('T')[0];
        await saveOrderToFirebase(currentClientId, pedido, pedido.id);
    }
};

// --------- FECHAS ---------
function calcularEstadoPedido(order) {
    const dias = calcularDiasRestantes(order.end);
    if (dias < 0) return {texto: 'Vencido', class: 'vencido'};
    if (dias <= 3) return {texto: 'Por vencer', class: 'por-vencer'};
    return {texto: 'Activo', class: 'activo'};
}
function calcularDiasRestantes(fechaFin) {
    const hoy = new Date();
    const fin = new Date(fechaFin + 'T23:59:59');
    const diff = Math.round((fin - hoy) / (1000*60*60*24));
    return diff;
}
function formateaFecha(fechaStr) {
    if (!fechaStr) return '';
    const f = new Date(fechaStr);
    return `${f.getDate().toString().padStart(2,'0')}/${(f.getMonth()+1).toString().padStart(2,'0')}/${f.getFullYear()}`;
}

// ====== TARJETA DE FIDELIDAD ======
const tabOrders      = document.getElementById('tabOrders');
const tabCard        = document.getElementById('tabCard');
const clientOrdersSection = document.getElementById('clientOrdersSection');
const clientCardSection = document.getElementById('clientCardSection');
const fidelityCard = document.getElementById('fidelityCard');
const cardClientName = document.getElementById('cardClientName');
const stampsContainer = document.getElementById('stampsContainer');
const exportCardBtn = document.getElementById('exportCardBtn');
const sendCardWA    = document.getElementById('sendCardWA');
const stampStyles = [
  "stamp.jpg",
  "stamp-star.jpg",
  "stamp-heart.jpg"
];
let selectedStampStyle = stampStyles[0];
const stampStyleOptions = document.getElementById("stampStyleOptions");
const uploadBgFile = document.getElementById('uploadBgFile');
const cardBgImg = document.getElementById('cardBgImg');
let selectedClientForCard = null;

// Tabs
tabOrders.onclick = ()=>{
    tabOrders.classList.add('active');
    tabCard.classList.remove('active');
    clientOrdersSection.style.display='';
    clientCardSection.style.display='none';
};
tabCard.onclick = ()=>{
    tabOrders.classList.remove('active');
    tabCard.classList.add('active');
    clientOrdersSection.style.display='none';
    clientCardSection.style.display='';
    renderFidelityCard();
    renderStampPicker();
};

function renderStampPicker() {
  stampStyleOptions.innerHTML = "";
  stampStyles.forEach((img,i)=>{
    const el = document.createElement("img");
    el.src = "assets/" + img;
    if(selectedStampStyle === img) el.className = "selected";
    el.onclick = () => {
      selectedStampStyle = img;
      renderStampPicker();
      renderFidelityCard();
      // actualiza el cliente en Firestore
      if(selectedClientForCard!=null && clients[selectedClientForCard].id){ 
        db.collection('clientes').doc(clients[selectedClientForCard].id).update({
            selectedStampStyle: img
        });
      }
    };
    stampStyleOptions.appendChild(el);
  });
}

// Imagen base
uploadBgFile.onchange = function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) {
    cardBgImg.src = evt.target.result;
    // Persistir en Firestore
    if(selectedClientForCard != null && clients[selectedClientForCard].id)
      db.collection('clientes').doc(clients[selectedClientForCard].id).update({
        cardBg: evt.target.result
      });
  };
  reader.readAsDataURL(file);
};

function renderFidelityCard() {
    const cli = clients[selectedClientForCard];
    cardClientName.textContent = cli?.name || '';
    // Fondo personalizado:
    cardBgImg.src = cli?.cardBg || "assets/card-base.png";
    selectedStampStyle = cli?.selectedStampStyle || stampStyles[0];
    const total = 10;
    if(!cli.stamps) cli.stamps = Array(total).fill(false);
    const stamps = cli.stamps;
    stampsContainer.innerHTML = '';
    // Distribución óvalo
    const cx = 165, cy = 108, rx = 118, ry = 55;
    for(let i=0;i<total;i++) {
        const angle = (Math.PI*2/total)*i-Math.PI/2;
        const x = cx + rx * Math.cos(angle) - 19;
        const y = cy + ry * Math.sin(angle) - 19;
        let extra = '';
        if (i === 4 && stamps[i]) {
            extra = `<div class="stamp-label descuento">15%<br>DESCUENTO</div>`;
        }
        if (i === 9 && stamps[i]) {
            extra = `<div class="stamp-label gratis">¡SERVICIO<br>GRATIS!</div>`;
        }
        stampsContainer.innerHTML += `
        <div class="stamp${stamps[i]?' marked':''}" data-idx="${i}" style="left:${x}px;top:${y}px;">
            <img src="assets/${selectedStampStyle}">
            <span class="stamp-number">${i+1}</span>
            ${extra}
        </div>`;
    }
    // Listener sellos
    stampsContainer.querySelectorAll('.stamp').forEach(stamp=>{
        stamp.onclick = async (e)=>{
            const idx = parseInt(stamp.dataset.idx);
            stamps[idx]=!stamps[idx];
            cli.stamps = stamps;
            renderFidelityCard();
            // Actualiza en Firestore
            if(cli.id)
                await db.collection('clientes').doc(cli.id).update({
                    stamps: stamps
                });
        };
    });
    // Nombre editable
    cardClientName.onblur = async (e)=>{
        const newName = cardClientName.textContent.trim();
        if(cli.id){
            await db.collection('clientes').doc(cli.id).update({ name: newName });
            cli.name = newName;
            renderClients();
        }
    };
    cardClientName.onkeydown = e=>{
        if(e.key==="Enter"){e.preventDefault();cardClientName.blur();}
    };
}

// EXPORT PNG
exportCardBtn.onclick = ()=>{
    html2canvas(fidelityCard).then(canvas=>{
        const a = document.createElement('a');
        a.download='tarjeta_'+(clients[selectedClientForCard].name||'cliente')+'.png';
        a.href=canvas.toDataURL("image/png");
        a.click();
    });
};
// WhatsApp
sendCardWA.onclick=()=>{
    const nombre = cardClientName.textContent.trim()||'Cliente';
    const mensaje = `¡Hola ${nombre}! Aquí está tu tarjeta de fidelidad.`;
    const telefono = clients[selectedClientForCard].phone.replace(/[^0-9]/g,'');
    const url = "https://wa.me/"+telefono+"?text="+encodeURIComponent(mensaje);
    window.open(url,'_blank');
};

// --- Arranque ---
listenClientsRealtime();