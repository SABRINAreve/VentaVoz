// 1. CLAVES DE ALMACENAMIENTO (localStorage)

const STORAGE_KEYS = {
    products: "ventavoz_products",
    sales: "ventavoz_sales",
    settings: "ventavoz_settings"
};

// 2. DATOS INICIALES DE DEMOSTRACIÓN

const defaultProducts = [
    { id: 1, name: "Colibrí Morado",      price: 2.25, category: "Batidos", active: true },
    { id: 2, name: "Batido de fresa",     price: 1.50, category: "Batidos", active: true },
    { id: 3, name: "Batido de mango",     price: 1.50, category: "Batidos", active: true },
    { id: 4, name: "Batido de piña",      price: 1.50, category: "Batidos", active: true },
    { id: 5, name: "Hot Dog sencillo",    price: 0.99, category: "Comida",  active: true },
    { id: 6, name: "Hot Dog con queso",   price: 1.50, category: "Comida",  active: true },
    { id: 7, name: "Sánduche de pollo",   price: 2.50, category: "Comida",  active: true }
];

const defaultSettings = {
    name: "VentaVoz",
    icon: "🥤",
    description: "Registra tus ventas de forma rápida mediante voz.",
    logo: "",            // dataURL de la imagen del logo (si el usuario sube una)
    primaryColor: "#6C4AB6",
    secondaryColor: "#563795",
    theme: "claro"        // "claro" | "oscuro"
};

// 3. ESTADO EN MEMORIA (se sincroniza con localStorage)

let products = loadFromStorage(STORAGE_KEYS.products, defaultProducts);
let sales = loadFromStorage(STORAGE_KEYS.sales, []);
let settings = loadFromStorage(STORAGE_KEYS.settings, defaultSettings);

let currentSale = [];      // productos que se están agregando a la venta actual
let lastMethod = "manual"; // "voz" o "manual", según cómo se agregó el último producto
let currentPeriod = "hoy"; // periodo activo en Estadísticas

function loadFromStorage(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
        console.warn("No se pudo leer " + key, error);
        return fallback;
    }
}

function saveProducts() {
    localStorage.setItem(STORAGE_KEYS.products, JSON.stringify(products));
}

function saveSales() {
    localStorage.setItem(STORAGE_KEYS.sales, JSON.stringify(sales));
}

function saveSettings() {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
}

// 4. UTILIDADES
// Formatea números como moneda: 3.5 -> "$3,50"
function formatMoney(amount) {
    return "$" + amount.toFixed(2).replace(".", ",");
}

// Quita acentos y pasa a minúsculas, para comparar texto sin preocuparnos por mayúsculas o tildes.
function normalizeText(text) {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

// Muestra una notificación pequeña en pantalla (reemplaza a alert()).
function showToast(message, type = "info") {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.className = "toast show " + type;

    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

// 5. NAVEGACIÓN ENTRE SECCIONES

const navButtons = document.querySelectorAll(".nav-button");
const sections = document.querySelectorAll(".section");
const pageTitle = document.getElementById("pageTitle");

function goToSection(sectionId) {
    navButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.section === sectionId));
    sections.forEach(sec => sec.classList.toggle("active-section", sec.id === sectionId));

    const activeButton = document.querySelector(`.nav-button[data-section="${sectionId}"]`);
    if (activeButton) {
        pageTitle.textContent = activeButton.textContent.trim();
    }

    refreshCurrentSection(sectionId);
}

navButtons.forEach(button => {
    button.addEventListener("click", () => goToSection(button.dataset.section));
});

// Botones tipo "acceso rápido" (data-goto) presentes en Inicio
document.querySelectorAll("[data-goto]").forEach(button => {
    button.addEventListener("click", () => goToSection(button.dataset.goto));
});

// Vuelve a dibujar solamente la sección visible (más eficiente)
function refreshCurrentSection(sectionId) {
    if (sectionId === "inicio") {
        updateTodayStatistics();
        renderRecentHistory();
    } else if (sectionId === "productos") {
        renderProducts();
    } else if (sectionId === "historial") {
        renderHistory();
    } else if (sectionId === "estadisticas") {
        updateStatistics();
    } else if (sectionId === "configuracion") {
        fillSettingsForm();
    }
}

// 6. RECONOCIMIENTO DE VOZ (Web Speech API)

const voiceButton = document.getElementById("voiceButton");
const voiceStatus = document.getElementById("voiceStatus");
const recognizedText = document.getElementById("recognizedText");

const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognitionAPI) {
    recognition = new SpeechRecognitionAPI();
    recognition.lang = "es-EC";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
        voiceButton.classList.add("listening");
        voiceStatus.textContent = "🎙️ Escuchando... habla ahora.";
    };

    recognition.onresult = (event) => {
        const text = event.results[0][0].transcript;
        recognizedText.textContent = `Escuché: "${text}"`;
        voiceStatus.textContent = "Procesando venta...";
        processVoiceSale(text);
    };

    recognition.onerror = (event) => {
        voiceButton.classList.remove("listening");

        if (event.error === "no-speech") {
            voiceStatus.textContent = "No se detectó ninguna voz. Intenta de nuevo.";
        } else if (event.error === "not-allowed" || event.error === "service-not-allowed") {
            voiceStatus.textContent = "Debes permitir el acceso al micrófono.";
        } else {
            voiceStatus.textContent = "No se pudo reconocer la voz. Prueba el registro manual.";
        }
    };

    recognition.onend = () => {
        voiceButton.classList.remove("listening");
    };

} else {
    // El navegador no soporta reconocimiento de voz: se ofrece el registro manual.
    voiceButton.disabled = true;
    voiceStatus.textContent = "Tu navegador no admite reconocimiento de voz. Usa el registro manual →";
}

voiceButton.addEventListener("click", () => {
    if (!recognition) {
        showToast("El reconocimiento de voz no está disponible en este navegador.", "error");
        return;
    }

    if (!navigator.onLine) {
        showToast("Sin conexión: el reconocimiento de voz puede no funcionar. Prueba el registro manual.", "error");
    }

    recognition.start();
});

// 6.1 Interpretar el texto reconocido y armar la venta
const NUMBER_WORDS = {
    "un": 1, "uno": 1, "una": 1,
    "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5,
    "seis": 6, "siete": 7, "ocho": 8, "nueve": 9, "diez": 10
};

// Convierte "batidos" -> "batido" (quita una 's' final) para poder
// reconocer productos aunque el usuario los diga en plural.
function singularize(word) {
    return word.endsWith("s") && word.length > 3 ? word.slice(0, -1) : word;
}

function processVoiceSale(text) {
    const normalized = normalizeText(text);

    // Separamos la frase en "trozos" usando la palabra "y" o comas,
    // así cada trozo suele contener un solo producto con su cantidad.
    const chunks = normalized.split(/\s+y\s+|,/);

    const foundItems = [];

    chunks.forEach(chunk => {
        const match = findProductInChunk(chunk);
        if (match) {
            foundItems.push(match);
        }
    });

    if (foundItems.length === 0) {
        voiceStatus.textContent =
            "No pudimos identificar los productos. Puedes intentar nuevamente o registrar la venta manualmente.";
        return;
    }

    foundItems.forEach(item => addToCurrentSale(item.product, item.quantity, "voz"));

    voiceStatus.textContent = "Venta detectada. Revísala y confirma antes de guardarla.";
    goToSection("registrar");
    renderCurrentSale();
}

// Busca, dentro de un trozo de texto, qué producto (activo) menciona
// y con qué cantidad. Devuelve { product, quantity } o null.
function findProductInChunk(chunk) {

    let bestMatch = null;

    products.filter(p => p.active).forEach(product => {

        const words = normalizeText(product.name).split(/\s+/).map(singularize);
        const chunkWords = chunk.split(/\s+/).map(singularize);

        // El producto "coincide" si todas sus palabras aparecen en el trozo.
        const allWordsPresent = words.every(w => chunkWords.includes(w));

        if (allWordsPresent) {
            // Preferimos el nombre de producto más largo (más específico).
            if (!bestMatch || words.length > bestMatch.wordsCount) {
                bestMatch = { product, wordsCount: words.length };
            }
        }
    });

    if (!bestMatch) return null;

    const quantity = detectQuantity(chunk);
    return { product: bestMatch.product, quantity };
}

// Busca un número (en palabras o dígitos) dentro de un trozo de texto.
function detectQuantity(chunk) {

    for (const word in NUMBER_WORDS) {
        if (new RegExp(`\\b${word}\\b`).test(chunk)) {
            return NUMBER_WORDS[word];
        }
    }

    const digitMatch = chunk.match(/\d+/);
    if (digitMatch) {
        return parseInt(digitMatch[0], 10);
    }

    return 1; // si no se menciona cantidad, se asume 1
}

// 7. REGISTRO MANUAL

const manualSearchInput = document.getElementById("manualSearchInput");
const manualProductsList = document.getElementById("manualProductsList");

function renderManualProductsList(filter = "") {

    const term = normalizeText(filter);

    const visibleProducts = products.filter(p =>
        p.active && normalizeText(p.name).includes(term)
    );

    manualProductsList.innerHTML = "";

    if (visibleProducts.length === 0) {
        manualProductsList.innerHTML = `<p class="empty-message">No se encontraron productos.</p>`;
        return;
    }

    visibleProducts.forEach(product => {
        const row = document.createElement("div");
        row.className = "manual-product-item";
        row.innerHTML = `
            <div>
                <strong>${product.name}</strong>
                <div class="small-text">${formatMoney(product.price)}</div>
            </div>
            <button type="button">+ Agregar</button>
        `;

        row.querySelector("button").addEventListener("click", () => {
            addToCurrentSale(product, 1, "manual");
            renderCurrentSale();
        });

        manualProductsList.appendChild(row);
    });
}

manualSearchInput.addEventListener("input", () => {
    renderManualProductsList(manualSearchInput.value);
});

// 8. CARRITO / VENTA ACTUAL (compartido por voz y manual)

const currentSaleContainer = document.getElementById("currentSale");
const saleTotalEl = document.getElementById("saleTotal");

function addToCurrentSale(product, quantity, method) {

    lastMethod = method;
    const existing = currentSale.find(item => item.product.id === product.id);

    if (existing) {
        existing.quantity += quantity;
    } else {
        currentSale.push({ product, quantity });
    }
}

function changeQuantity(productId, delta) {
    const item = currentSale.find(i => i.product.id === productId);
    if (!item) return;

    item.quantity += delta;

    if (item.quantity <= 0) {
        currentSale = currentSale.filter(i => i.product.id !== productId);
    }

    renderCurrentSale();
}

function removeFromSale(productId) {
    currentSale = currentSale.filter(i => i.product.id !== productId);
    renderCurrentSale();
}

function renderCurrentSale() {

    if (currentSale.length === 0) {
        currentSaleContainer.innerHTML = `<p class="empty-message">No hay productos agregados.</p>`;
        saleTotalEl.textContent = formatMoney(0);
        return;
    }

    currentSaleContainer.innerHTML = "";
    let total = 0;

    currentSale.forEach(item => {
        const subtotal = item.product.price * item.quantity;
        total += subtotal;

        const row = document.createElement("div");
        row.className = "sale-item";
        row.innerHTML = `
            <div class="sale-item-info">
                <strong>${item.product.name}</strong>
                <small>${formatMoney(item.product.price)} c/u</small>
            </div>

            <div class="qty-controls">
                <button type="button" data-action="minus">−</button>
                <span>${item.quantity}</span>
                <button type="button" data-action="plus">+</button>
            </div>

            <strong>${formatMoney(subtotal)}</strong>
            <button type="button" class="remove-item">🗑️</button>
        `;

        row.querySelector('[data-action="plus"]').addEventListener("click", () => changeQuantity(item.product.id, 1));
        row.querySelector('[data-action="minus"]').addEventListener("click", () => changeQuantity(item.product.id, -1));
        row.querySelector(".remove-item").addEventListener("click", () => removeFromSale(item.product.id));

        currentSaleContainer.appendChild(row);
    });

    saleTotalEl.textContent = formatMoney(total);
    document.getElementById("currentSale").scrollIntoView({ behavior: "smooth" });
}

// Confirmar venta: aquí es donde realmente se guarda en el historial.
document.getElementById("confirmSaleButton").addEventListener("click", () => {

    if (currentSale.length === 0) {
        showToast("No hay productos en la venta.", "error");
        return;
    }

    let total = 0;
    let totalProducts = 0;

    const items = currentSale.map(item => {
        total += item.product.price * item.quantity;
        totalProducts += item.quantity;

        return {
            productId: item.product.id,
            name: item.product.name,
            price: item.product.price,
            quantity: item.quantity
        };
    });

    const sale = {
        id: Date.now(),
        date: new Date().toISOString(),
        items,
        total,
        totalProducts,
        method: lastMethod
    };

    sales.push(sale);
    saveSales();

    showToast(`Venta registrada: ${formatMoney(total)}`, "success");

    currentSale = [];
    recognizedText.textContent = "";
    voiceStatus.textContent = ' ';
    renderCurrentSale();
});

// Cancelar venta: descarta el carrito sin guardar nada.
document.getElementById("cancelSaleButton").addEventListener("click", () => {
    currentSale = [];
    recognizedText.textContent = "";
    voiceStatus.textContent = ' ';
    renderCurrentSale();
});

document.getElementById("clearSaleButton").addEventListener("click", () => {
    currentSale = [];
    renderCurrentSale();
});

// 9. PRODUCTOS (crear, editar, eliminar)

const productsContainer = document.getElementById("productsContainer");
const productModal = document.getElementById("productModal");
const productModalTitle = document.getElementById("productModalTitle");

const productIdInput = document.getElementById("productIdInput");
const productNameInput = document.getElementById("productNameInput");
const productPriceInput = document.getElementById("productPriceInput");
const productCategoryInput = document.getElementById("productCategoryInput");
const productActiveInput = document.getElementById("productActiveInput");

function renderProducts(filter = "") {

    const term = normalizeText(filter);

    const visible = products.filter(p =>
        normalizeText(p.name).includes(term) || normalizeText(p.category || "").includes(term)
    );

    productsContainer.innerHTML = "";

    if (visible.length === 0) {
        productsContainer.innerHTML = `<p class="empty-message">No hay productos que coincidan.</p>`;
        return;
    }

    visible.forEach(product => {
        const card = document.createElement("div");
        card.className = "product-card" + (product.active ? "" : " inactive");

        card.innerHTML = `
            ${product.category ? `<span class="product-category">${product.category}</span>` : ""}
            <h3>${product.name}</h3>
            <p class="product-price">${formatMoney(product.price)}</p>
            <p class="small-text">${product.active ? "Activo" : "Inactivo"}</p>
            <div class="product-actions">
                <button class="edit-product" type="button">✏️ Editar</button>
                <button class="delete-product" type="button">🗑️ Eliminar</button>
            </div>
        `;

        card.querySelector(".edit-product").addEventListener("click", () => openProductModal(product));
        card.querySelector(".delete-product").addEventListener("click", () => deleteProduct(product.id));

        productsContainer.appendChild(card);
    });
}

document.getElementById("productSearchInput").addEventListener("input", (e) => {
    renderProducts(e.target.value);
});

function openProductModal(product = null) {

    if (product) {
        productModalTitle.textContent = "Editar producto";
        productIdInput.value = product.id;
        productNameInput.value = product.name;
        productPriceInput.value = product.price;
        productCategoryInput.value = product.category || "";
        productActiveInput.checked = product.active;
    } else {
        productModalTitle.textContent = "Nuevo producto";
        productIdInput.value = "";
        productNameInput.value = "";
        productPriceInput.value = "";
        productCategoryInput.value = "";
        productActiveInput.checked = true;
    }

    productModal.classList.add("show");
}

document.getElementById("addProductButton").addEventListener("click", () => openProductModal());
document.getElementById("closeModalButton").addEventListener("click", () => productModal.classList.remove("show"));

document.getElementById("saveProductButton").addEventListener("click", () => {

    const name = productNameInput.value.trim();
    const price = parseFloat(productPriceInput.value);
    const category = productCategoryInput.value.trim();
    const active = productActiveInput.checked;
    const id = productIdInput.value;

    if (!name || isNaN(price) || price < 0) {
        showToast("Ingresa correctamente el nombre y el precio.", "error");
        return;
    }

    if (id) {
        // Editar producto existente
        const product = products.find(p => p.id === Number(id));
        if (product) {
            product.name = name;
            product.price = price;
            product.category = category;
            product.active = active;
        }
        showToast("Producto actualizado.", "success");
    } else {
        // Crear producto nuevo
        products.push({ id: Date.now(), name, price, category, active });
        showToast("Producto agregado.", "success");
    }

    saveProducts();
    renderProducts();
    productModal.classList.remove("show");
});

function deleteProduct(id) {
    if (!confirm("¿Quieres eliminar este producto?")) return;

    products = products.filter(p => p.id !== id);
    saveProducts();
    renderProducts();
    showToast("Producto eliminado.", "success");
}

// 10. HISTORIAL DE VENTAS

const historyContainer = document.getElementById("historyContainer");
const recentHistoryContainer = document.getElementById("recentHistory");

function buildHistoryItemHTML(sale) {
    const date = new Date(sale.date);
    const dateText = date.toLocaleString("es-EC", { dateStyle: "short", timeStyle: "short" });

    const productsText = sale.items
        .map(item => `${item.name} ×${item.quantity}`)
        .join(", ");

    const methodLabel = sale.method === "voz" ? "🎙️ Voz" : "⌨️ Manual";

    return `
        <div class="history-item">
            <div class="history-header">
                <strong>${dateText}</strong>
                <span class="history-total">${formatMoney(sale.total)}</span>
            </div>
            <p>${productsText}</p>
            <span class="history-method">${methodLabel}</span>
        </div>
    `;
}

function renderHistory() {
    if (sales.length === 0) {
        historyContainer.innerHTML = `<p class="empty-message">Todavía no existen ventas.</p>`;
        return;
    }

    historyContainer.innerHTML = [...sales].reverse().map(buildHistoryItemHTML).join("");
}

function renderRecentHistory() {
    if (sales.length === 0) {
        recentHistoryContainer.innerHTML = `<p class="empty-message">Todavía no existen ventas.</p>`;
        return;
    }

    recentHistoryContainer.innerHTML = [...sales].reverse().slice(0, 5).map(buildHistoryItemHTML).join("");
}

// 11. ESTADÍSTICAS

document.querySelectorAll(".period-button").forEach(button => {
    button.addEventListener("click", () => {
        document.querySelectorAll(".period-button").forEach(b => b.classList.remove("active"));
        button.classList.add("active");
        currentPeriod = button.dataset.period;
        updateStatistics();
    });
});

// Devuelve las ventas dentro del periodo seleccionado (hoy / semana / mes)
function getSalesForPeriod(period) {

    const now = new Date();

    return sales.filter(sale => {
        const saleDate = new Date(sale.date);

        if (period === "hoy") {
            return saleDate.toDateString() === now.toDateString();
        }

        if (period === "semana") {
            const weekAgo = new Date(now);
            weekAgo.setDate(now.getDate() - 7);
            return saleDate >= weekAgo;
        }

        if (period === "mes") {
            return saleDate.getMonth() === now.getMonth() && saleDate.getFullYear() === now.getFullYear();
        }

        return true;
    });
}

function updateStatistics() {

    const periodSales = getSalesForPeriod(currentPeriod);

    let income = 0;
    let totalProductsSold = 0;
    const counter = {};

    periodSales.forEach(sale => {
        income += sale.total;
        totalProductsSold += sale.totalProducts;

        sale.items.forEach(item => {
            counter[item.name] = (counter[item.name] || 0) + item.quantity;
        });
    });

    document.getElementById("totalIncome").textContent = formatMoney(income);
    document.getElementById("totalTransactions").textContent = periodSales.length;
    document.getElementById("totalProducts").textContent = totalProductsSold;

    renderRanking("topProducts", counter, "desc");
    renderRanking("bottomProducts", counter, "asc");
    renderSalesChart(periodSales);
}

function renderRanking(containerId, counter, order) {
    const container = document.getElementById(containerId);
    const entries = Object.entries(counter).sort((a, b) => order === "desc" ? b[1] - a[1] : a[1] - b[1]);

    if (entries.length === 0) {
        container.innerHTML = `<p class="empty-message">Todavía no existen datos.</p>`;
        return;
    }

    container.innerHTML = entries.slice(0, 5).map(([name, qty]) => `
        <div class="sale-item">
            <strong>${name}</strong>
            <span>${qty} vendidos</span>
        </div>
    `).join("");
}

// Gráfico simple de barras (canvas nativo, sin librerías externas)
function renderSalesChart(periodSales) {

    const canvas = document.getElementById("salesChart");
    const ctx = canvas.getContext("2d");

    // Ajustamos el tamaño real del canvas al tamaño mostrado en pantalla
    canvas.width = canvas.clientWidth;
    canvas.height = 160;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Agrupamos el total vendido por día (clave: "AAAA-MM-DD")
    const totalsByDay = {};
    periodSales.forEach(sale => {
        const d = new Date(sale.date);
        const day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
        totalsByDay[day] = (totalsByDay[day] || 0) + sale.total;
    });

    const days = Object.keys(totalsByDay).sort();

    if (days.length === 0) {
        ctx.fillStyle = "#999";
        ctx.font = "14px Arial";
        ctx.fillText("Todavía no hay ventas en este periodo.", 10, 80);
        return;
    }

    const maxValue = Math.max(...days.map(d => totalsByDay[d]));
    const barWidth = canvas.width / (days.length * 1.5);
    const gap = barWidth * 0.5;
    const chartHeight = canvas.height - 30;

    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#6C4AB6";

    days.forEach((day, index) => {
        const value = totalsByDay[day];
        const barHeight = maxValue > 0 ? (value / maxValue) * chartHeight : 0;
        const x = index * (barWidth + gap) + gap;
        const y = chartHeight - barHeight;

        ctx.fillStyle = primaryColor;
        ctx.fillRect(x, y, barWidth, barHeight);

        ctx.fillStyle = "#888";
        ctx.font = "10px Arial";
        const label = day.slice(5); // MM-DD
        ctx.fillText(label, x, canvas.height - 12);
    });
}

// 12. ESTADÍSTICAS RÁPIDAS DE "INICIO" (solo el día de hoy)

function updateTodayStatistics() {

    const todaySales = getSalesForPeriod("hoy");

    let income = 0;
    let productsSold = 0;

    todaySales.forEach(sale => {
        income += sale.total;
        productsSold += sale.totalProducts;
    });

    document.getElementById("todaySales").textContent = formatMoney(income);
    document.getElementById("todayTransactions").textContent = todaySales.length;
    document.getElementById("todayProducts").textContent = productsSold;
}

// 13. CONFIGURACIÓN / PERSONALIZACIÓN
const businessNameEl = document.getElementById("businessName");
const businessTaglineEl = document.getElementById("businessTagline");
const logoIconEl = document.getElementById("logoIcon");
const logoImageEl = document.getElementById("logoImage");

// Aplica la configuración guardada a toda la aplicación (colores, nombre, tema...)
function applySettings() {

    businessNameEl.textContent = settings.name;
    businessTaglineEl.textContent = settings.description || "";
    document.title = settings.name;

    if (settings.logo) {
        logoImageEl.src = settings.logo;
        logoImageEl.classList.remove("hidden");
        logoIconEl.classList.add("hidden");
    } else {
        logoImageEl.classList.add("hidden");
        logoIconEl.classList.remove("hidden");
        logoIconEl.textContent = settings.icon || "🥤";
    }

    document.documentElement.style.setProperty("--primary", settings.primaryColor);
    document.documentElement.style.setProperty("--primary-dark", settings.secondaryColor);

    document.body.setAttribute("data-theme", settings.theme === "oscuro" ? "oscuro" : "claro");
}

// Rellena el formulario de Configuración con los valores actuales
function fillSettingsForm() {
    document.getElementById("businessNameInput").value = settings.name;
    document.getElementById("businessIconInput").value = settings.icon;
    document.getElementById("businessDescriptionInput").value = settings.description || "";
    document.getElementById("primaryColorInput").value = settings.primaryColor;
    document.getElementById("secondaryColorInput").value = settings.secondaryColor;

    document.querySelectorAll('input[name="theme"]').forEach(radio => {
        radio.checked = (radio.value === settings.theme);
    });
}

document.getElementById("logoInput").addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        settings.logo = reader.result; // dataURL en base64
        applySettings();
    };
    reader.readAsDataURL(file);
});

document.getElementById("removeLogoButton").addEventListener("click", () => {
    settings.logo = "";
    document.getElementById("logoInput").value = "";
    applySettings();
});

document.getElementById("saveSettingsButton").addEventListener("click", () => {

    const name = document.getElementById("businessNameInput").value.trim();
    const icon = document.getElementById("businessIconInput").value.trim();
    const description = document.getElementById("businessDescriptionInput").value.trim();
    const primaryColor = document.getElementById("primaryColorInput").value;
    const secondaryColor = document.getElementById("secondaryColorInput").value;
    const theme = document.querySelector('input[name="theme"]:checked').value;

    settings = {
        name: name || "VentaVoz",
        icon: icon || "🥤",
        description,
        logo: settings.logo,
        primaryColor,
        secondaryColor,
        theme
    };

    saveSettings();
    applySettings();
    showToast("Configuración guardada correctamente.", "success");
});

document.getElementById("resetDataButton").addEventListener("click", () => {
    if (!confirm("Esto borrará todos los productos, ventas y configuración guardados. ¿Continuar?")) return;

    localStorage.removeItem(STORAGE_KEYS.products);
    localStorage.removeItem(STORAGE_KEYS.sales);
    localStorage.removeItem(STORAGE_KEYS.settings);

    location.reload();
});

// 14. ESTADO DE CONEXIÓN A INTERNET

function updateConnectionStatus() {
    const dot = document.getElementById("connectionDot");
    const text = document.getElementById("connectionText");

    if (navigator.onLine) {
        dot.style.background = "#28a36a";
        text.textContent = "En línea";
    } else {
        dot.style.background = "#d9534f";
        text.textContent = "Sin conexión";
    }
}

window.addEventListener("online", updateConnectionStatus);
window.addEventListener("offline", updateConnectionStatus);

// 16. INICIO DE LA APLICACIÓN
function initApp() {
    applySettings();
    renderManualProductsList();
    renderCurrentSale();
    updateConnectionStatus();
    refreshCurrentSection("inicio");
}

initApp();