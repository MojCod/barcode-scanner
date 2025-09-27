// Main variables
let scanner = null;
let products = JSON.parse(localStorage.getItem('products')) || [];
let isFlashOn = false;
let flashStream = null;
let currentProductData = null;
let isScanning = false;

// Supported barcode formats
const SUPPORTED_FORMATS = [
    'code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 
    'upc_a', 'upc_e', 'codabar', 'i2of5', '2of5'
];

// Convert any numbers to English
function convertToEnglishNumbers(str) {
    if (!str) return '';
    
    const numberMap = {
        '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
        '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
        '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
        '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
    };
    
    return str.split('').map(char => numberMap[char] || char).join('');
}

// Validate number input
function validateNumberInput(input) {
    let value = convertToEnglishNumbers(input.value);
    value = value.replace(/[^0-9]/g, '');
    
    if (input.id === 'manualShortcodeInput' || input.id === 'productShortcode') {
        value = value.substring(0, 7);
    }
    
    input.value = value;
}

// Advanced scanner using Quagga
function startAdvancedScanner() {
    if (isScanning) {
        showResult('Scanner is already running');
        return;
    }

    showResult('Initializing advanced scanner...');
    
    const readerElement = document.getElementById('reader');
    readerElement.innerHTML = '<div class="scanning-overlay"></div><video id="video" playsinline autoplay></video>';
    
    Quagga.init({
        inputStream: {
            name: "Live",
            type: "LiveStream",
            target: readerElement,
            constraints: {
                facingMode: "environment",
                width: { min: 640 },
                height: { min: 480 }
            }
        },
        decoder: {
            readers: SUPPORTED_FORMATS,
            multiple: false
        },
        locator: {
            patchSize: "medium",
            halfSample: true
        },
        locate: true,
        frequency: 10
    }, function(err) {
        if (err) {
            console.error('Quagga init error:', err);
            showResult('Scanner initialization failed: ' + err);
            return;
        }
        
        isScanning = true;
        Quagga.start();
        showResult('Advanced scanner started - Point camera at barcode');
    });

    Quagga.onDetected(function(result) {
        if (result.codeResult && result.codeResult.code) {
            const code = result.codeResult.code;
            const format = result.codeResult.format;
            
            showResult(`Detected: ${code} (${format})`);
            handleScannedBarcode(code, format.toUpperCase());
            
            // Stop temporarily to prevent multiple detections
            Quagga.stop();
            isScanning = false;
            
            // Restart after 2 seconds
            setTimeout(() => {
                if (!isScanning) {
                    Quagga.start();
                    isScanning = true;
                }
            }, 2000);
        }
    });

    Quagga.onProcessed(function(result) {
        const drawingCtx = Quagga.canvas.ctx.overlay;
        const drawingCanvas = Quagga.canvas.dom.overlay;

        if (result) {
            if (result.boxes) {
                drawingCtx.clearRect(0, 0, parseInt(drawingCanvas.getAttribute("width")), parseInt(drawingCanvas.getAttribute("height")));
                result.boxes.filter(function(box) {
                    return box !== result.box;
                }).forEach(function(box) {
                    Quagga.ImageDebug.drawPath(box, {x: 0, y: 1}, drawingCtx, {color: "green", lineWidth: 2});
                });
            }

            if (result.box) {
                Quagga.ImageDebug.drawPath(result.box, {x: 0, y: 1}, drawingCtx, {color: "#00F", lineWidth: 2});
            }

            if (result.codeResult && result.codeResult.code) {
                Quagga.ImageDebug.drawPath(result.line, {x: 'x', y: 'y'}, drawingCtx, {color: 'red', lineWidth: 3});
            }
        }
    });
}

// Fast flashlight control
async function toggleFlashlight() {
    const flashButton = document.querySelector('.flash-btn');
    const flashStatus = document.getElementById('flashStatus');
    
    try {
        if (!isFlashOn) {
            flashStatus.textContent = 'Turning on flash...';
            flashButton.disabled = true;
            
            if (flashStream) {
                const track = flashStream.getVideoTracks()[0];
                if (track && 'applyConstraints' in track) {
                    await track.applyConstraints({
                        advanced: [{ torch: true }]
                    });
                }
            } else {
                flashStream = await navigator.mediaDevices.getUserMedia({
                    video: { 
                        facingMode: "environment",
                        torch: true
                    }
                });
            }
            
            isFlashOn = true;
            flashButton.textContent = '🔦 Flash On';
            flashButton.style.background = '#ffeb3b';
            flashStatus.textContent = 'Flash is ON';
            
        } else {
            flashStatus.textContent = 'Turning off flash...';
            flashButton.disabled = true;
            
            if (flashStream) {
                const tracks = flashStream.getVideoTracks();
                for (const track of tracks) {
                    if ('applyConstraints' in track) {
                        try {
                            await track.applyConstraints({
                                advanced: [{ torch: false }]
                            });
                        } catch (e) {
                            console.log('Error turning off flash:', e);
                        }
                    }
                    track.stop();
                }
                flashStream = null;
            }
            
            isFlashOn = false;
            flashButton.textContent = '🔦 Flash Off';
            flashButton.style.background = '#ffc107';
            flashStatus.textContent = 'Flash is OFF';
        }
    } catch (error) {
        console.error('Flash error:', error);
        flashStatus.textContent = 'Flash not supported';
        flashButton.textContent = '🔦 Flash Error';
        flashButton.style.background = '#6c757d';
    } finally {
        flashButton.disabled = false;
        setTimeout(() => {
            flashStatus.textContent = '';
        }, 2000);
    }
}

function stopScanner() {
    if (isScanning) {
        Quagga.stop();
        isScanning = false;
        const readerElement = document.getElementById('reader');
        readerElement.innerHTML = '';
        showResult('Scanner stopped');
    }
    
    if (isFlashOn) {
        toggleFlashlight();
    }
}

function handleScannedBarcode(barcode, format) {
    const existingProduct = products.find(p => p.barcode === barcode);
    
    if (existingProduct) {
        if (confirm(`Product "${existingProduct.name}" exists! Edit details?`)) {
            openProductModal(existingProduct);
        }
    } else {
        currentProductData = { barcode: barcode, format: format };
        openProductModal();
    }
}

// Manual entry functions
function openManualBarcode() {
    document.getElementById('manualBarcodeModal').style.display = 'flex';
    document.getElementById('manualBarcodeInput').value = '';
    document.getElementById('manualBarcodeInput').focus();
}

function closeManualBarcodeModal() {
    document.getElementById('manualBarcodeModal').style.display = 'none';
}

function submitManualBarcode() {
    const barcodeInput = document.getElementById('manualBarcodeInput');
    let barcode = convertToEnglishNumbers(barcodeInput.value.trim());
    barcode = barcode.replace(/[^0-9]/g, '');
    
    if (!barcode) {
        alert('Please enter barcode!');
        return;
    }

    closeManualBarcodeModal();
    handleScannedBarcode(barcode, 'MANUAL');
}

function openManualShortcode() {
    document.getElementById('manualShortcodeModal').style.display = 'flex';
    document.getElementById('manualShortcodeInput').value = '';
    document.getElementById('manualProductName').value = '';
    document.getElementById('manualShortcodeInput').focus();
}

function closeManualShortcodeModal() {
    document.getElementById('manualShortcodeModal').style.display = 'none';
}

function submitManualShortcode() {
    const shortcodeInput = document.getElementById('manualShortcodeInput');
    const nameInput = document.getElementById('manualProductName');
    
    let shortcode = convertToEnglishNumbers(shortcodeInput.value.trim());
    shortcode = shortcode.replace(/[^0-9]/g, '');
    const name = nameInput.value.trim();
    
    if (!shortcode) {
        alert('Please enter shortcode!');
        return;
    }

    if (shortcode.length !== 7) {
        alert('Shortcode must be exactly 7 digits!');
        return;
    }

    if (!name) {
        alert('Please enter product name!');
        return;
    }

    const existing = products.find(p => p.shortcode === shortcode);
    if (existing) {
        alert('Shortcode already exists!');
        return;
    }

    const now = new Date();
    const product = {
        id: Date.now(),
        barcode: 'SHORTCODE_' + shortcode,
        shortcode: shortcode,
        format: 'SHORTCODE',
        name: name,
        price: 0,
        quantity: 1,
        scanDate: now.toLocaleDateString(),
        expireDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(),
        timestamp: now.getTime()
    };

    products.push(product);
    localStorage.setItem('products', JSON.stringify(products));
    displayProducts();
    closeManualShortcodeModal();
    showResult('Product added: ' + name);
}

// Product modal management
function openProductModal(product = null) {
    const modal = document.getElementById('productModal');
    const nameInput = document.getElementById('productName');
    const shortcodeInput = document.getElementById('productShortcode');
    const priceInput = document.getElementById('productPrice');
    const quantityInput = document.getElementById('productQuantity');

    if (product) {
        nameInput.value = product.name || '';
        shortcodeInput.value = product.shortcode || '';
        priceInput.value = product.price || '';
        quantityInput.value = product.quantity || 1;
        currentProductData = product;
    } else {
        nameInput.value = '';
        shortcodeInput.value = '';
        priceInput.value = '';
        quantityInput.value = '1';
    }

    modal.style.display = 'flex';
    nameInput.focus();
}

function closeModal() {
    document.getElementById('productModal').style.display = 'none';
    currentProductData = null;
}

function saveProduct() {
    const name = document.getElementById('productName').value.trim();
    const price = parseFloat(document.getElementById('productPrice').value);
    const quantity = parseInt(document.getElementById('productQuantity').value);
    let shortcode = document.getElementById('productShortcode').value.trim();
    
    shortcode = convertToEnglishNumbers(shortcode);
    shortcode = shortcode.replace(/[^0-9]/g, '');
    
    if (shortcode && shortcode.length > 7) {
        alert('Shortcode cannot exceed 7 digits!');
        return;
    }

    if (!name || isNaN(price) || price < 0 || isNaN(quantity) || quantity < 1) {
        alert('Please fill all fields correctly!');
        return;
    }

    if (shortcode) {
        const existingShortcode = products.find(p => p.shortcode === shortcode && 
            (!currentProductData || p.id !== currentProductData.id));
        if (existingShortcode) {
            alert('Shortcode already used by another product!');
            return;
        }
    }

    const now = new Date();
    const expireDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    let product;
    
    if (currentProductData && currentProductData.id) {
        product = {
            ...currentProductData,
            name: name,
            price: price,
            quantity: quantity,
            shortcode: shortcode || null
        };
        
        const index = products.findIndex(p => p.id === currentProductData.id);
        if (index !== -1) {
            products[index] = product;
        }
    } else {
        product = {
            id: Date.now(),
            barcode: currentProductData?.barcode || 'MANUAL_' + Date.now(),
            format: currentProductData?.format || 'MANUAL',
            name: name,
            price: price,
            quantity: quantity,
            shortcode: shortcode || null,
            scanDate: now.toLocaleDateString(),
            expireDate: expireDate.toLocaleDateString(),
            timestamp: now.getTime()
        };
        products.push(product);
    }

    localStorage.setItem('products', JSON.stringify(products));
    displayProducts();
    closeModal();
    showResult('Product saved: ' + name);
}

// Display products
function displayProducts() {
    const container = document.getElementById('productList');
    
    if (products.length === 0) {
        container.innerHTML = '<p>No products yet</p>';
        return;
    }

    container.innerHTML = products.map(product => `
        <div class="product-item">
            <strong>${product.name}</strong><br>
            <small>Barcode: ${product.barcode}</small><br>
            Price: $${product.price} | Qty: ${product.quantity}
            ${product.shortcode ? '<br>Shortcode: ' + product.shortcode : ''}
            <br>Scan Date: ${product.scanDate}
            <div style="margin-top: 10px;">
                <button onclick="editProduct(${product.id})" style="background: #007bff; color: white; padding: 5px 10px; border: none; border-radius: 3px; margin-right: 5px;">Edit</button>
                <button onclick="deleteProduct(${product.id})" style="background: #dc3545; color: white; padding: 5px 10px; border: none; border-radius: 3px;">Delete</button>
            </div>
        </div>
    `).join('');
}

function editProduct(id) {
    const product = products.find(p => p.id === id);
    if (product) {
        openProductModal(product);
    }
}

function deleteProduct(id) {
    if (confirm('Delete this product?')) {
        products = products.filter(p => p.id !== id);
        localStorage.setItem('products', JSON.stringify(products));
        displayProducts();
        showResult('Product deleted');
    }
}

function showResult(message) {
    document.getElementById('result').textContent = message;
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    displayProducts();
    
    // Check camera permissions
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(() => console.log('Camera access granted'))
        .catch(() => console.log('Camera access denied'));
});