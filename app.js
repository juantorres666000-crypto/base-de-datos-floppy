// === FIREBASE ===
// Asegúrate de incluir los scripts de Firebase y la config en tu index.html antes que este archivo.

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
        renderFidelityRanking();
        renderCentralAlerts();
        renderOrdersSection();
        renderAlertsPanel();
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
function renderAlertsPanel() {
    // Recopila todos los pedidos de todos los clientes
    let porVencer = [];
    let vencidos = [];
    const hoy = new Date();
    clients.forEach(cli => {
        if (!cli.orders) return;
        cli.orders.forEach(ped => {
            const fin = new Date(ped.end + "T23:59:59");
            const dias = Math.round((fin - hoy)/(1000*60*60*24));
            let info = {
                cliente: cli.name,
                clienteId: cli.id,
                phone: cli.phone,
                pedido: ped,
                dias
            };
            if (dias < 0) {
                vencidos.push(info);
            } else if (dias <= 3) {
                porVencer.push(info);
            }
        });
    });

    // Construye HTML
    let html = '';
    // Por vencer
    html += `<div class="alert-block alert-block-por-vencer">
        <div class="alert-block-title">🟠 Por vencer (hasta 3 días)</div>
        <ul class="alert-list">`;
    if(porVencer.length) {
        porVencer.forEach(item => {
            html += `<li class="alert-client">
                <b>${item.cliente}</b> (#${item.pedido.numero}) 
                - <span style="color:#ffbe3c">${item.dias} días</span>
                <div class="alert-actions">
                    <span class="alert-link" onclick="window.showClientOrdersById('${item.clienteId}')">Ver</span>
                    <span class="alert-link" onclick="sendWhatsAppAlert('${item.phone}', '${item.cliente}', '${item.pedido.end}')">WhatsApp</span>
                </div>
            </li>`;
        });
    } else {
        html += `<li style="opacity:.7;">Ningún servicio por vencer</li>`;
    }
    html += `</ul></div>`;

    // Vencidos
    html += `<div class="alert-block alert-block-vencido">
        <div class="alert-block-title">🔴 Vencidos</div>
        <ul class="alert-list">`;
    if(vencidos.length) {
        vencidos.forEach(item => {
            html += `<li class="alert-client">
                <b>${item.cliente}</b> (#${item.pedido.numero}) 
                - <span style="color:var(--neon-pink)">hace ${-item.dias} días</span>
                <div class="alert-actions">
                    <span class="alert-link" onclick="window.showClientOrdersById('${item.clienteId}')">Ver</span>
                    <span class="alert-link" onclick="sendWhatsAppAlert('${item.phone}', '${item.cliente}', '${item.pedido.end}')">WhatsApp</span>
                </div>
            </li>`;
        });
    } else {
        html += `<li style="opacity:.7;">Ningún servicio vencido</li>`;
    }
    html += `</ul></div>`;

    document.getElementById("alertsPanel").innerHTML = html;
}

// Ayuda para buscar el cliente por id y abrir el panel lateral
window.showClientOrdersById = clienteId => {
    let i = clients.findIndex(c=>c.id===clienteId);
    if(i>=0) showClientOrders(i);
}

// WhatsApp rápido desde alerta
window.sendWhatsAppAlert = (telefono, nombre, fechaEnd) => {
    const mensaje = `¡Hola ${nombre}! Te recordamos que tu servicio vencerá/pronto venció el ${fechaEnd}. ¿Te gustaría renovarlo?`;
    window.open(`https://wa.me/${telefono.replace(/[^0-9]/g,'')}?text=${encodeURIComponent(mensaje)}`,'_blank');
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

// Navegación sidebar (solo agrega/remueve clase active)
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

// MODIFICAR: Formulario de PEDIDO (agregar y editar)
addOrderBtn.onclick = () => {
    orderMode = 'add';
    orderModalTitle.textContent = "Agregar Pedido";
    saveOrderBtn.textContent = "Agregar";
    orderForm.reset();
    modalOrderBg.classList.add('active');
    document.getElementById('orderService').focus();
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
    // CAMPOS: incluye service
    document.getElementById('orderService').value = pedido.service || "";
    document.getElementById('orderCorreo').value = pedido.correo || "";
    document.getElementById('orderPerfil').value = pedido.perfil || "";
    document.getElementById('orderPin').value = pedido.pin || "";
    document.getElementById('orderStart').value = pedido.start;
    document.getElementById('orderEnd').value = pedido.end;
    document.getElementById('orderPriceOwner').value = pedido.priceOwner;
    document.getElementById('orderPriceClient').value = pedido.priceClient;
    modalOrderBg.classList.add('active');
    document.getElementById('orderService').focus();
};


orderForm.onsubmit = async function(e) {
    e.preventDefault();
    // CAMPOS SEPARADOS del pedido
    const service = document.getElementById('orderService').value.trim();
    const correo = document.getElementById('orderCorreo').value.trim();
    const perfil = document.getElementById('orderPerfil').value.trim();
    const pin = document.getElementById('orderPin').value.trim();
    const start = document.getElementById('orderStart').value;
    const end = document.getElementById('orderEnd').value;
    const priceOwner = parseFloat(document.getElementById('orderPriceOwner').value);
    const priceClient = parseFloat(document.getElementById('orderPriceClient').value);

    if (!service || !correo || !perfil || !pin || !start || !end || isNaN(priceOwner) || isNaN(priceClient)) return;

    if (orderMode === 'edit') {
        await saveOrderToFirebase(currentClientId, {
            service, correo, perfil, pin, start, end, priceOwner, priceClient
        }, editOrderId);
    } else {
        const clientOrders = clients[currentClientIdx].orders;
        const nextNumber = (clientOrders.length ? Math.max(...clientOrders.map(p=>p.numero||0)) + 1 : 1);
        await saveOrderToFirebase(currentClientId, {
            numero: nextNumber, service, correo, perfil, pin, start, end, priceOwner, priceClient
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
        const dias = calcularDiasRestantes(order.end);
        // Mostrar solo servicio, inicio, fin, dias restantes + boton Ver más
        ordersList.innerHTML += `
        <div class="order-card">
            <div class="order-header">
                <span class="order-num">#${order.numero || (i+1)}</span>
                <span style="font-weight:bold;color:var(--neon-blue);">${order.service || '-'}</span>
            </div>
            <div class="order-info">
                <div class="order-field">
                    <span class="order-label">Inicio:</span>
                    <span class="order-value">${formateaFecha(order.start)}</span>
                </div>
                <div class="order-field">
                    <span class="order-label">Fin:</span>
                    <span class="order-value">${formateaFecha(order.end)}</span>
                </div>
                <div class="order-field">
                    <span class="order-label">Días restantes:</span>
                    <span class="order-value">${dias >= 0 ? dias : 0}</span>
                </div>
            </div>
            <div class="order-actions">
                <button class="neon-btn-sm" onclick="showOrderDetails(${i})">Ver más</button>
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

// Mostrar modal con TODOS los detalles del pedido
const modalOrderViewBg = document.getElementById('modalOrderViewBg');
const orderViewContent = document.getElementById('orderViewContent');
const orderViewTitle = document.getElementById('orderViewTitle');
const orderViewCloseBtn = document.getElementById('orderViewCloseBtn');
const orderViewEditBtn = document.getElementById('orderViewEditBtn');
let viewOrderIdx = null;

window.showOrderDetails = (idx) => {
    viewOrderIdx = idx;
    const pedido = clients[currentClientIdx].orders[idx];
    orderViewTitle.textContent = `Pedido #${pedido.numero || (idx+1)} - ${pedido.service || ''}`;
    orderViewContent.innerHTML = `
        <div style="font-size:0.98em;">
          <div style="margin-bottom:.6em;"><b>Servicio:</b> ${pedido.service || ''}</div>
          <div style="margin-bottom:.6em;"><b>Correo:</b> ${pedido.correo || ''}</div>
          <div style="margin-bottom:.6em;"><b>Contraseña / Perfil:</b> ${pedido.perfil || ''}</div>
          <div style="margin-bottom:.6em;"><b>PIN:</b> ${pedido.pin || ''}</div>
          <div style="margin-bottom:.6em;"><b>Inicio:</b> ${formateaFecha(pedido.start)}</div>
          <div style="margin-bottom:.6em;"><b>Fin:</b> ${formateaFecha(pedido.end)}</div>
          <div style="margin-bottom:.6em;"><b>Días restantes:</b> ${Math.max(0, calcularDiasRestantes(pedido.end))}</div>
          <div style="margin-bottom:.6em;"><b>Precio a ti:</b> $${pedido.priceOwner?.toFixed(2) || '0.00'}</div>
          <div style="margin-bottom:.6em;"><b>Para cliente:</b> $${pedido.priceClient?.toFixed(2) || '0.00'}</div>
        </div>
        <div style="margin-top:1em; display:flex; gap:.6em; flex-wrap:wrap;">
            <button class="neon-btn-sm" onclick="showEditOrder(${idx}); closeOrderViewModal();">Editar</button>
            <button class="neon-btn-sm outline" onclick="showDeleteOrder(${idx}); closeOrderViewModal();">Eliminar</button>
            <button class="neon-btn-sm outline" onclick="marcarPedidoVencido(${idx}); closeOrderViewModal();">Marcar vencido</button>
        </div>
    `;
    modalOrderViewBg.classList.add('active');
};

function closeOrderViewModal() {
    modalOrderViewBg.classList.remove('active');
}
orderViewCloseBtn.onclick = closeOrderViewModal;
modalOrderViewBg.onclick = function(e) { if (e.target === modalOrderViewBg) closeOrderViewModal(); }

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
// Reemplaza la función formateaFecha existente por esta versión
function formateaFecha(fechaStr) {
    if (!fechaStr) return '';
    // Si ya es un objeto Date, formateamos directamente
    if (fechaStr instanceof Date && !isNaN(fechaStr)) {
        const f = fechaStr;
        return `${f.getDate().toString().padStart(2,'0')}/${(f.getMonth()+1).toString().padStart(2,'0')}/${f.getFullYear()}`;
    }
    // Intentamos parsear cadenas YYYY-MM-DD de forma segura (creando Date en zona local)
    const m = String(fechaStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    let f;
    if (m) {
        const year = Number(m[1]), month = Number(m[2]) - 1, day = Number(m[3]);
        f = new Date(year, month, day); // crea fecha en zona local — evita desplazamiento UTC
    } else {
        // fallback: si no coincide con YYYY-MM-DD, intentamos new Date() (para compatibilidad con otros formatos)
        f = new Date(fechaStr);
    }
    if (isNaN(f)) return ''; // fecha inválida
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

// EXPORT PNG (mejorada: verificación y nombre seguro)
if (exportCardBtn) {
    exportCardBtn.onclick = ()=> {
        const fidelityCardEl = document.getElementById('fidelityCard');
        if (!fidelityCardEl) { alert('No se encontró la tarjeta para exportar.'); return; }
        html2canvas(fidelityCardEl).then(canvas=>{
            const a = document.createElement('a');
            const nameSafe = (clients[selectedClientForCard]?.name || 'cliente').replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_\-]/g,'');
            a.download='tarjeta_'+nameSafe+'.png';
            a.href=canvas.toDataURL("image/png");
            a.click();
        }).catch(err=>{
            console.error('Error exportando tarjeta:', err);
            alert('No se pudo exportar la tarjeta.');
        });
    };
}

// WhatsApp desde tarjeta de fidelidad (verifica cliente seleccionado)
if (sendCardWA) {
    sendCardWA.onclick=()=>{
        if (selectedClientForCard == null || !clients[selectedClientForCard] || !clients[selectedClientForCard].phone) {
            alert('Selecciona primero un cliente (abre "Ver Detalles" en un cliente y luego ve a la pestaña Tarjeta).');
            return;
        }
        const cli = clients[selectedClientForCard];
        const nombre = (cli.name || 'Cliente').trim();
        const telefono = (cli.phone || '').replace(/[^0-9]/g,'');
        if (!telefono) { alert('Teléfono inválido.'); return; }
        const mensaje = `¡Hola ${nombre}! Te envío tu tarjeta de fidelidad.`;
        window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`, '_blank');
    };
}

// --- Arranque ---
listenClientsRealtime();


// Al final del archivo, tras tu código principal o en la sección de navegación

// ====== PLANTILLAS (Firestore-backed OR localStorage) ======
let templates = []; // Cada plantilla: {id, title, msg}
let editingTemplateIdx = null;

const templateSection = document.getElementById('templateSection');
const templateList = document.getElementById('templateList');
const addTemplateBtn = document.getElementById('addTemplateBtn');
const modalTemplateBg = document.getElementById('modalTemplateBg');
const templateForm = document.getElementById('templateForm');
const templateModalTitle = document.getElementById('templateModalTitle');
const templateTitle = document.getElementById('templateTitle');
const templateMsg = document.getElementById('templateMsg');
const cancelTemplateBtn = document.getElementById('cancelTemplateBtn');


// Mostrar sección plantillas desde el menú lateral
// Nota: no ocultamos todo el main; simplemente mostramos/ocultamos las secciones internas
const sectionNavLinks = document.querySelectorAll('.sidebar-nav li');
const mainContent = document.querySelector('.main-content');
const ordersSection = document.getElementById('ordersSection');
const fidelitySection = document.getElementById('fidelitySection');
const centralAlertsSection = document.getElementById('centralAlertsSection');
const clientsListEl = document.getElementById('clientsList');

sectionNavLinks.forEach((item,idx) => {
    item.onclick = function() {
        sectionNavLinks.forEach(e => e.classList.remove('active'));
        item.classList.add('active');
        // Mostrar / ocultar secciones específicas
        clientsListEl.style.display = idx===0 ? "" : "none";
        ordersSection.style.display = idx===1 ? "" : "none";
        fidelitySection.style.display = idx===2 ? "" : "none";
        centralAlertsSection.style.display = idx===3 ? "" : "none";
        templateSection.style.display = idx===4 ? "" : "none";
        // Render según sección
        if(idx===1) renderOrdersSection();
        if(idx===2) renderFidelityRanking();
        if(idx===3) renderCentralAlerts();
        if(idx===4) renderTemplateList();
    }
});

// Renderiza la lista de plantillas
function renderTemplateList() {
    templateList.innerHTML = '';
    if(templates.length === 0) {
        templateList.innerHTML = `<div style="margin:2em 0;opacity:.5;">No hay plantillas definidas.</div>`;
        return;
    }
    templates.forEach((tpl, i) => {
        templateList.innerHTML += `
        <div class="client-card template-card" style="margin-bottom:1.3em;padding:.82em 1em 1.1em 1.1em;">
        <div style="font-size:1.1em;font-weight:bold;color:var(--neon-pink);margin-bottom:.45em;">${tpl.title}</div>
        <div style="font-size:.97em;opacity:.78;margin-bottom:.6em;white-space:pre-line;">${tpl.msg}</div>
        <div class="client-actions" style="margin-top:.4em;">
            <button class="neon-btn-sm" onclick="chooseClientForWA(${i})">Enviar</button>
            <button class="neon-btn-sm outline" onclick="editTemplate(${i})">Editar</button>
            <button class="neon-btn-sm outline" onclick="deleteTemplate(${i})">Eliminar</button>
        </div>
        </div>`;
    });
}
window.renderTemplateList = renderTemplateList;

// Modales plantilla
addTemplateBtn.onclick = () => {
    editingTemplateIdx = null; 
    templateModalTitle.textContent = "Nueva plantilla";
    templateForm.reset();
    modalTemplateBg.style.display = "flex";
    templateTitle.focus();
};
// Aseguramos que Cancelar cierre el modal correctamente
if (cancelTemplateBtn) {
    cancelTemplateBtn.onclick = () => modalTemplateBg.style.display = "none";
}
if (modalTemplateBg) {
    modalTemplateBg.onclick = e=>{ if(e.target===modalTemplateBg) modalTemplateBg.style.display="none"};
}

window.editTemplate = idx => {
    editingTemplateIdx = idx;
    templateModalTitle.textContent = "Editar plantilla";
    templateTitle.value = templates[idx].title;
    templateMsg.value = templates[idx].msg;
    modalTemplateBg.style.display = "flex";
    templateTitle.focus();
};
window.deleteTemplate = idx => {
    if(confirm("¿Eliminar plantilla?")) {
        templates.splice(idx,1);
        renderTemplateList();
        saveTemplatesLS();
    }
};
templateForm.onsubmit = function(e) {
    e.preventDefault();
    const t = templateTitle.value.trim(), m = templateMsg.value.trim();
    if(editingTemplateIdx !== null) {
        templates[editingTemplateIdx] = {title:t, msg:m};
    } else {
        templates.push({title:t, msg:m});
    }
    renderTemplateList();
    modalTemplateBg.style.display="none";
    saveTemplatesLS();
};

// Guardar plantillas en localStorage (puedes pasar a Firebase si quieres)
function saveTemplatesLS() {
    localStorage.setItem('plantillas', JSON.stringify(templates));
}
function loadTemplatesLS() {
    const t = localStorage.getItem('plantillas');
    if(t) templates = JSON.parse(t);
}
loadTemplatesLS();

// ------ Modal elegir cliente y envío WA -------
const modalChooseClient = document.getElementById('modalChooseClient');
const chooseClientList = document.getElementById('chooseClientList');
const cancelChooseClientBtn = document.getElementById('cancelChooseClientBtn');
let chosenTemplateMsg = "";

// Reemplaza la función chooseClientForWA existente por esta versión
window.chooseClientForWA = idx => {
    // carga el mensaje de la plantilla seleccionada
    chosenTemplateMsg = templates[idx].msg || "";
    const modal = document.getElementById('modalChooseClient');
    const searchInput = document.getElementById('chooseClientSearch');
    const list = document.getElementById('chooseClientList');

    // muestra el modal y prepara el input
    modal.style.display = "flex";
    if (searchInput) searchInput.value = "";
    list.innerHTML = `<div style="opacity:.7">Escribe para buscar clientes por nombre, teléfono o email...</div>`;
    if (searchInput) searchInput.focus();

    // renderiza resultados según término
    const renderResults = (term) => {
        const q = (term||"").toLowerCase().trim();
        list.innerHTML = "";
        if (!q) {
            list.innerHTML = `<div style="opacity:.7">Escribe para buscar clientes por nombre, teléfono o email...</div>`;
            return;
        }
        const results = clients.filter(cli =>
            (cli.name && cli.name.toLowerCase().includes(q)) ||
            (cli.phone && cli.phone.toLowerCase().includes(q)) ||
            (cli.email && cli.email.toLowerCase().includes(q))
        );
        if (!results.length) {
            list.innerHTML = `<div style="opacity:.7">No se encontraron clientes</div>`;
            return;
        }
        // crea elementos para cada resultado
        results.forEach(cli => {
            const phoneClean = (cli.phone || "").replace(/[^0-9]/g,'');
            const safeMsg = (chosenTemplateMsg || "").replace(/`/g,'\\`');
            const safeName = (cli.name || "").replace(/`/g,'\\`').replace(/"/g,'&quot;');
            const el = document.createElement('div');
            el.className = 'client-card';
            el.style.marginBottom = '.7em';
            el.style.padding = '.6em';
            el.style.display = 'flex';
            el.style.flexDirection = 'column';
            el.innerHTML = `
                <div style="font-size:1.05em;font-weight:bold;color:var(--neon-green);margin-bottom:.12em;">${cli.name}</div>
                <div style="font-size:.96em;opacity:.7; margin-bottom:.5em;">${cli.phone || ''}</div>
                <button class="neon-btn-sm" style="align-self:flex-start" onclick="sendWAtoClient('${phoneClean}', \`${safeMsg}\`, \`${safeName}\`)">
                  Enviar a ${cli.name}
                </button>
            `;
            list.appendChild(el);
        });
    };

    // manejador de búsqueda
    if (searchInput) {
        searchInput.oninput = (e) => {
            renderResults(e.target.value);
        };
    }
};

// Enviar WhatsApp desde modal de búsqueda — incluye nombre y cierra modal después
window.sendWAtoClient = (phone, msg, clientName) => {
    if (!phone) {
        alert('Teléfono inválido');
        return;
    }
    // Incluye nombre al comienzo del mensaje si existe
    const saludo = clientName ? `¡Hola ${clientName}! ` : '¡Hola! ';
    const text = saludo + (msg || '');
    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    // Abrir en nueva pestaña
    window.open(waUrl, '_blank');
    // Cerrar modal de selección si está abierto
    const modal = document.getElementById('modalChooseClient');
    if (modal) modal.style.display = 'none';
};

// Cerrar modal elegir cliente (asegurar handlers existentes)
if (cancelChooseClientBtn) cancelChooseClientBtn.onclick = () => { if (modalChooseClient) modalChooseClient.style.display = 'none'; };
if (modalChooseClient) modalChooseClient.onclick = (e) => { if (e.target === modalChooseClient) modalChooseClient.style.display = 'none'; };

// ====== PEDIDOS: Área general ("Pedidos") ======
function renderOrdersSection() {
    const area = document.getElementById('ordersTableArea');
    let allOrders = [];
    clients.forEach(cli => {
        (cli.orders||[]).forEach(ped => {
            allOrders.push({cli, ped});
        });
    });
    // Filtro buscador
    const term = (document.getElementById('orderSearch').value||"").toLowerCase().trim();
    if(term) {
        allOrders = allOrders.filter(row =>
            (row.cli.name&&row.cli.name.toLowerCase().includes(term)) ||
            (row.cli.email&&row.cli.email.toLowerCase().includes(term)) ||
            (row.ped.correo&&row.ped.correo.toLowerCase().includes(term)) ||
            (row.ped.perfil&&row.ped.perfil.toLowerCase().includes(term)) ||
            (row.ped.pin&&row.ped.pin.toLowerCase().includes(term)) ||
            (row.ped.service&&row.ped.service.toLowerCase().includes(term))
        );
    }
    // Table HEAD
    let html = `<table class='orders-table'><tr>
        <th>#</th><th>Cliente</th><th>Servicio</th><th>Inicio</th><th>Fin</th><th>Estado</th><th></th>
        </tr>`;
    // ROWS
    if(allOrders.length) {
        allOrders.forEach((row,k) => {
            const estado = calcularEstadoPedido(row.ped);
            html += `<tr>
            <td>${row.ped.numero||k+1}</td>
            <td>${row.cli.name}</td>
            <td>${row.ped.service||''}</td>
            <td>${formateaFecha(row.ped.start)}</td>
            <td>${formateaFecha(row.ped.end)}</td>
            <td style="color:${estado.class==='vencido'?'#ff44cc':estado.class==='por-vencer'?'#ffbe3c':'#39ff14'};
                font-weight:bold;">${estado.texto}</td>
            <td>
                <button class='neon-btn-sm' onclick='showClientOrders(${clients.indexOf(row.cli)})'>🡒 Ir</button>
            </td>
            </tr>`;
        });
    }
    html += "</table>";
    if(allOrders.length === 0)
        html = `<div class="fake-empty-message">No hay pedidos registrados aún.<br><br>Puedes agregar uno desde el panel de <b>Detalles</b> de un cliente.</div>`;
    area.innerHTML = html;
}
document.getElementById('orderSearch').oninput = renderOrdersSection;

// ====== FIDELIDAD: Área resumen ("Fidelidad") ======
function renderFidelityRanking() {
    const area = document.getElementById('fidelityRankingArea');
    // Ranking según sellos
    let ranking = clients.map(cli=>({
        name: cli.name,
        email: cli.email,
        stamps: (cli.stamps||[]).filter(Boolean).length,
    })).filter(c=>c.name);
    ranking.sort((a,b)=>b.stamps-a.stamps);

    let html = `<table class='fidelity-table'>
        <tr><th>Cliente</th><th>Correo</th><th>Sellos</th></tr>`;
    if(ranking.length && ranking.some(c=>c.stamps>0)) {
        ranking.forEach(item => {
            if(item.stamps>0)
            html += `<tr>
                <td style="color:var(--neon-green);">${item.name}</td>
                <td>${item.email||""}</td>
                <td style="font-weight:bold;color:var(--neon-pink); font-size:1.25em;">${item.stamps}</td>
            </tr>`;
        });
    }
    html += "</table>";
    if(ranking.length === 0 || !ranking.some(c=>c.stamps>0))
        html = `<div class='fake-empty-message'>Aquí verás el <b>ranking de fidelidad</b> de tus clientes,<br>sus progresos y premios por sello.<br><br>Marca sellos en una tarjeta y aparecerán aquí.</div>`;
    area.innerHTML = html;
}

// ====== ALERTAS: Área central ("Alertas") ======
function renderCentralAlerts() {
    const area = document.getElementById('centralAlertsArea');
    let allVencidos = [], allPorVencer = [];
    const hoy = new Date();
    clients.forEach(cli=>{
        (cli.orders||[]).forEach(ped=>{
            let dias = calcularDiasRestantes(ped.end);
            if(dias < 0) allVencidos.push({cli,ped,dias});
            else if(dias<=3) allPorVencer.push({cli,ped,dias});
        });
    });

    let html = '';
    if(allPorVencer.length) {
        html += `<div class="fake-alert-block" style="border-left:4px solid #ffbe3c">
        <b>Por vencer:</b><br>`;
        allPorVencer.forEach(item=>{
            html+=`${item.cli.name} (#${item.ped.numero||""}), vence en <b>${item.dias}</b> días<br>`;
        });
        html+=`</div>`;
    }
    if(allVencidos.length) {
        html += `<div class="fake-alert-block" style="border-left:4px solid #ff44cc">
        <b>Vencidos:</b><br>`;
        allVencidos.forEach(item=>{
            html+=`${item.cli.name} (#${item.ped.numero||""}), vencido hace <b>${-item.dias}</b> días<br>`;
        });
        html+=`</div>`;
    }
    if(!allPorVencer.length && !allVencidos.length) {
        html += `<div class="fake-empty-message">¡Todo en orden!<br>No hay alertas ni vencimientos próximos.<br><br>Cuando se acerque la fecha de algún pedido,<br>aquí lo verás automáticamente.</div>`;
    }
    area.innerHTML = html;
}

// Puedes llamar los render desde la navegación
