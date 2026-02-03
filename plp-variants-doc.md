# PLP Quick Add — Guia completa del JavaScript

## Indice

1. [Estructura general del archivo](#1-estructura-general-del-archivo)
2. [IIFE: por que todo esta envuelto en una funcion?](#2-iife-por-que-todo-esta-envuelto-en-una-funcion)
3. [CONFIG: el objeto de configuracion central](#3-config-el-objeto-de-configuracion-central)
4. [Variables de estado globales (dentro del IIFE)](#4-variables-de-estado-globales-dentro-del-iife)
5. [Sistema de cache del DOM](#5-sistema-de-cache-del-dom)
6. [Utilidades de imagenes](#6-utilidades-de-imagenes)
7. [Sistema de preload de imagenes](#7-sistema-de-preload-de-imagenes)
8. [Estado por producto](#8-estado-por-producto)
9. [Actualizacion de enlaces](#9-actualizacion-de-enlaces)
10. [Renderizado de tallas](#10-renderizado-de-tallas)
11. [Actualizacion de UI (precio, boton, imagen)](#11-actualizacion-de-ui-precio-boton-imagen)
12. [Galeria por color (slideshow)](#12-galeria-por-color-slideshow)
13. [Carrito: addToCart y updateCartCount](#13-carrito-addtocart-y-updatecartcount)
14. [Event Handlers: color, talla, add to cart](#14-event-handlers-color-talla-add-to-cart)
15. [Event Delegation: como se capturan los clicks](#15-event-delegation-como-se-capturan-los-clicks)
16. [Hover: imagenes y preload](#16-hover-imagenes-y-preload)
17. [Inicializacion](#17-inicializacion)
18. [API publica](#18-api-publica)
19. [Conceptos de JavaScript usados](#19-conceptos-de-javascript-usados)

---

## 1. Estructura general del archivo

El archivo tiene ~945 lineas y esta organizado en secciones con comentarios:

```
(function() {           ← IIFE (se ejecuta inmediatamente)
  'use strict';

  CONFIG               ← Constantes
  Variables globales   ← Estado, caches, controllers
  Utilidades           ← Funciones helper reutilizables
  Estado               ← Manejo del estado por producto
  Enlaces              ← Actualizacion de URLs
  Renderizado          ← Crear/actualizar botones de talla
  UI                   ← Actualizar precio, boton, imagen
  Galeria              ← Slideshow por color
  Carrito              ← addToCart, updateCartCount
  Event Handlers       ← handleColorClick, handleSizeClick, handleAddToCartClick
  Event Delegation     ← Un solo listener en document
  Hover                ← Hover de imagenes y preload
  Inicializacion       ← init() + DOMContentLoaded
  API publica          ← window.PLPVariants
})();
```

---

## 2. IIFE: por que todo esta envuelto en una funcion?

```javascript
(function() {
  'use strict';
  // ... todo el codigo ...
})();
```

**Que es:** IIFE = Immediately Invoked Function Expression. Es una funcion que se define y se ejecuta al instante.

**Por que se usa:**
- **Encapsulacion**: Todo lo que se declara adentro (`const`, `function`, `let`) es PRIVADO. No contamina el scope global (`window`). Si otro script define una variable `CONFIG`, no hay conflicto.
- **`'use strict'`**: Activa el modo estricto de JavaScript. Previene errores comunes como usar variables sin declarar.

**Sin IIFE**, si escribieras `const CONFIG = {...}` directamente, cualquier otro script podria pisarlo o leerlo. Con IIFE, solo las cosas que explicitamente pongas en `window` son visibles desde afuera.

---

## 3. CONFIG: el objeto de configuracion central

```javascript
const CONFIG = {
  FEEDBACK_DURATION: 2000,    // 2 segundos para mensajes de feedback
  MESSAGE_DURATION: 1500,     // 1.5 segundos para mensajes temporales
  SELECTORS: {
    controller: '.plp-variant-controller',
    colorBtn: '.plp-color',
    sizeBtn: '.plp-size',
    addToCartBtn: '.plp-add-to-cart',
    sizesContainer: '.plp-sizes',
    colorsContainer: '.plp-colors',
    productCard: 'product-card',
    productCardLink: 'product-card-link',
    priceContainer: '[ref="priceContainer"]',
    price: '.price',
    compareAtPrice: '.compare-at-price',
    cardGallery: '.card-gallery',
    slideshow: 'slideshow-component',
    slide: 'slideshow-slide',
    cartBadge: '.tae-cart-count-badge'
  },
  CLASSES: {
    active: 'active',
    out: 'out',
    ready: 'ready',
    success: 'success',
    error: 'error',
    soldOut: 'sold-out'
  },
  MESSAGES: {
    selectVariant: 'Selecciona talla y color',
    addToBag: 'Agregar a la bolsa →',
    added: '¡Agregado! ✓',
    soldOut: 'Agotado',
    error: 'Error'
  }
};
```

**Por que se usa un objeto CONFIG:**
- Todos los selectores CSS, clases y mensajes estan en UN solo lugar
- Si necesitas cambiar un selector o un mensaje, lo cambias en CONFIG y se actualiza en todo el archivo
- Evita "magic strings" (strings sueltos por todo el codigo que son dificiles de rastrear)

**Ejemplo de uso:**
```javascript
// En vez de:
document.querySelector('.plp-color')

// Se usa:
document.querySelector(CONFIG.SELECTORS.colorBtn)
```

---

## 4. Variables de estado globales (dentro del IIFE)

```javascript
const selectedState = {};           // Estado de seleccion por producto
const domCache = new Map();         // Cache de elementos DOM
const preloadedImages = new Set();  // Imagenes ya precargadas
let currentFetchController = null;  // AbortController para fetch
```

### selectedState
Un objeto plano donde cada key es un product ID:
```javascript
selectedState = {
  "123456": { color: "Negro", size: "M", variantId: "44012345" },
  "789012": { color: "Azul",  size: null, variantId: null }
}
```

### domCache (Map)
Un `Map` que guarda referencias a elementos DOM para no buscarlos repetidamente. `Map` es como un objeto pero:
- Las keys pueden ser de cualquier tipo (no solo strings)
- Tiene `.has()`, `.get()`, `.set()`, `.delete()` (mas claro que `obj[key]`)
- Mejor performance para accesos frecuentes

### preloadedImages (Set)
Un `Set` es como un array pero sin duplicados. Si haces `.add("url.jpg")` dos veces, solo se guarda una vez. Perfecto para rastrear "ya precargue esta imagen?"

### currentFetchController
Un `AbortController` que permite cancelar peticiones fetch en curso. Si el usuario hace click rapido en "agregar al carrito" dos veces, la primera peticion se cancela.

---

## 5. Sistema de cache del DOM

```javascript
function getProductCache(productId) {
  if (!domCache.has(productId)) {
    const card = document.querySelector(
      `${CONFIG.SELECTORS.productCard}[data-product-id="${productId}"]`
    );
    if (!card) return null;

    domCache.set(productId, {
      card,
      cardLink: card.closest(CONFIG.SELECTORS.productCardLink),
      priceContainer: card.querySelector(CONFIG.SELECTORS.priceContainer),
      cardGallery: card.querySelector(CONFIG.SELECTORS.cardGallery),
      links: null  // Se calcula lazy
    });
  }
  return domCache.get(productId);
}
```

**Que hace:** La primera vez que pides el cache de un producto, busca los elementos en el DOM y los guarda. Las siguientes veces devuelve el cache sin buscar.

**Por que:**
- `document.querySelector()` es costoso si se llama muchas veces
- Los elementos no cambian de lugar, asi que guardarlos en memoria es seguro
- `links: null` es "lazy" — no se calcula hasta que alguien lo necesite

**`card.closest(selector)`:** Busca hacia ARRIBA en el DOM. Si `card` esta dentro de un `<product-card-link>`, lo encuentra. Es lo opuesto de `querySelector` que busca hacia abajo.

**Template literals con selectores:**
```javascript
`${CONFIG.SELECTORS.productCard}[data-product-id="${productId}"]`
// Se convierte en: product-card[data-product-id="123456"]
```

---

## 6. Utilidades de imagenes

### getImageUrl — Reescribir URLs de Shopify CDN

```javascript
function getImageUrl(src, width) {
  if (!src) return '';

  if (src.includes('cdn.shopify.com')) {
    // Patron: _WIDTHx. o _WIDTHxHEIGHT.
    const sizePattern = /_\d+x\d*\./;
    if (sizePattern.test(src)) {
      return src.replace(sizePattern, `_${width}x.`);
    }
    return src.replace(/\.(\w+)(\?.*)?$/, `_${width}x.$1$2`);
  }

  const url = new URL(src, window.location.origin);
  url.searchParams.set('width', width);
  return url.toString();
}
```

**Que hace:** Toma una URL de imagen de Shopify y le cambia el tamano.

**Ejemplo:**
```
Input:  "//cdn.shopify.com/s/files/image_800x.jpg"
Output: "//cdn.shopify.com/s/files/image_400x.jpg"  (con width=400)
```

**Regex explicada:**
- `/_\d+x\d*\./` → Busca `_` + uno o mas digitos + `x` + cero o mas digitos + `.`
  - Matchea: `_800x.`, `_800x600.`, `_1200x.`
- `/\.(\w+)(\?.*)?$/` → Busca `.extension` opcionalmente seguido de `?query`
  - Matchea: `.jpg`, `.png?v=123`
  - Los parentesis `()` son "grupos de captura": `$1` = extension, `$2` = query string

### generateSrcset — Imagenes responsivas

```javascript
function generateSrcset(src) {
  if (!src) return '';
  return [400, 800, 1200].map(w => `${getImageUrl(src, w)} ${w}w`).join(', ');
}
```

**Que hace:** Genera un atributo `srcset` para que el navegador elija la imagen del tamano correcto segun la pantalla.

**Ejemplo de output:**
```
"//cdn.shopify.com/image_400x.jpg 400w, //cdn.shopify.com/image_800x.jpg 800w, //cdn.shopify.com/image_1200x.jpg 1200w"
```

**`.map().join()`:** Un patron muy comun:
- `.map()` transforma cada elemento del array
- `.join(', ')` une los resultados en un string separado por comas

---

## 7. Sistema de preload de imagenes

### preloadImage — Precargar una imagen

```javascript
function preloadImage(src, width = 800) {
  if (!src) return Promise.resolve();

  const url = getImageUrl(src, width);
  if (preloadedImages.has(url)) return Promise.resolve();

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      preloadedImages.add(url);
      resolve();
    };
    img.onerror = resolve;  // No fallar si la imagen no carga
    img.src = url;
  });
}
```

**Como funciona:**
1. Verifica si ya se precargo (usando el Set)
2. Crea un `new Image()` invisible (no se agrega al DOM)
3. Le asigna el `src` — el navegador la descarga y la guarda en cache
4. Cuando se cargue (`onload`), la marca como precargada
5. Retorna una `Promise` para poder esperar si se necesita

**`Promise.resolve()`**: Retorna una Promise que ya esta resuelta inmediatamente. Es una forma de decir "no hay nada que hacer, pero te devuelvo una Promise para mantener la interfaz consistente."

**`width = 800`**: Parametro con valor por defecto. Si llamas `preloadImage(src)` sin segundo argumento, usa 800.

### preloadColorImages — Precargar galeria de un color

```javascript
function preloadColorImages(productId, color) {
  const product = window.PLP?.[productId];
  if (!product) return;

  const variants = product.variants.filter(v => v.options.includes(color));
  if (!variants.length) return;

  const preload = () => {
    const variant = variants[0];
    if (variant.gallery?.length) {
      variant.gallery.slice(0, 2).forEach(src => preloadImage(src));
    } else if (variant.featured_media?.src) {
      preloadImage(variant.featured_media.src);
    }
  };

  if ('requestIdleCallback' in window) {
    requestIdleCallback(preload, { timeout: 100 });
  } else {
    setTimeout(preload, 0);
  }
}
```

**Conceptos clave:**

**Optional chaining (`?.`):**
```javascript
window.PLP?.[productId]
// Si window.PLP es null/undefined, retorna undefined en vez de tirar error
// Equivale a: window.PLP && window.PLP[productId]

variant.gallery?.length
// Si variant.gallery es null, retorna undefined en vez de error
```

**`.filter()` y `.includes()`:**
```javascript
product.variants.filter(v => v.options.includes(color))
// Filtra el array de variantes, quedandose solo con las que tienen el color
// .includes() revisa si el array options contiene el valor color
```

**`.slice(0, 2)`:** Toma los primeros 2 elementos del array (posicion 0 y 1). No modifica el array original.

**`requestIdleCallback`:**
- Le dice al navegador: "cuando no estes ocupado, ejecuta esta funcion"
- Ideal para tareas no urgentes como precargar imagenes
- `{ timeout: 100 }` = ejecutala en maximo 100ms aunque estes ocupado
- Si el navegador no soporta `requestIdleCallback`, usa `setTimeout(fn, 0)` como fallback

---

## 8. Estado por producto

```javascript
function initProductState(productId) {
  if (!selectedState[productId]) {
    selectedState[productId] = {
      color: null,
      size: null,
      variantId: null
    };
  }
  return selectedState[productId];
}
```

**Patron "get or create":** Si el estado del producto no existe, lo crea con valores nulos. Si ya existe, lo retorna. Esto asegura que siempre tengas un objeto valido.

**Nota:** Como retorna una REFERENCIA al objeto (no una copia), cualquier cambio que hagas al objeto retornado se refleja en `selectedState`:
```javascript
const state = initProductState("123");
state.color = "Negro";  // Esto modifica selectedState["123"].color
```

---

## 9. Actualizacion de enlaces

```javascript
function updateProductLinks(productId, variantId) {
  if (!productId || !variantId) return;

  const cache = getProductCache(productId);
  if (!cache) return;

  // Lazy: calcular links solo la primera vez
  if (!cache.links) {
    const cardLinks = cache.card.querySelectorAll('a[href*="/products/"]');
    const parentLinks = cache.cardLink
      ? cache.cardLink.querySelectorAll('a[href*="/products/"]')
      : [];
    cache.links = [...new Set([...cardLinks, ...parentLinks])];
  }

  cache.links.forEach(link => {
    try {
      const url = new URL(link.href, window.location.origin);
      if (url.pathname.includes('/products/')) {
        url.searchParams.set('variant', variantId);
        link.href = url.toString();
      }
    } catch (e) {
      // Silently fail
    }
  });
}
```

**Que hace:** Encuentra todos los links `<a>` que apuntan a paginas de producto y les agrega `?variant=44012345` para que al hacer click el PDP abra con la variante correcta.

**Conceptos:**

**`a[href*="/products/"]`:** Selector CSS de atributo. El `*=` significa "contiene". Busca todos los `<a>` cuyo `href` contenga "/products/".

**Spread + Set para deduplicar:**
```javascript
cache.links = [...new Set([...cardLinks, ...parentLinks])];
```
Paso a paso:
1. `[...cardLinks, ...parentLinks]` — Combina las dos NodeLists en un solo array
2. `new Set(...)` — Elimina duplicados (si un link aparece en ambas listas)
3. `[...set]` — Convierte el Set de vuelta a array

**`new URL(link.href, origin)`:** Crea un objeto URL que permite manipular query params facilmente:
```javascript
const url = new URL("https://tienda.com/products/camisa");
url.searchParams.set('variant', '12345');
url.toString(); // "https://tienda.com/products/camisa?variant=12345"
```

---

## 10. Renderizado de tallas

```javascript
function renderSizes(productId, variants, controller) {
  const container = controller.querySelector(CONFIG.SELECTORS.sizesContainer);
  if (!container) return;

  const firstAvailable = variants.find(v => v.available);
  const state = initProductState(productId);

  // DocumentFragment para mejor performance
  const fragment = document.createDocumentFragment();

  variants.forEach(v => {
    const isFirstAvailable = firstAvailable && v.id === firstAvailable.id;
    const btn = document.createElement('button');

    btn.className = `plp-size${v.available ? '' : ' out'}${isFirstAvailable ? ' active' : ''}`;
    btn.disabled = !v.available;
    btn.dataset.variantId = v.id;
    btn.textContent = v.options[1];  // La talla esta en la posicion 1

    fragment.appendChild(btn);
  });

  container.innerHTML = '';       // Limpia los botones anteriores
  container.appendChild(fragment); // Agrega los nuevos de una sola vez

  // Auto-seleccionar primera talla disponible
  if (firstAvailable) {
    state.size = firstAvailable.options[1];
    state.variantId = firstAvailable.id;
  } else {
    state.size = null;
    state.variantId = null;
  }
}
```

**DocumentFragment:**
- Es un "contenedor invisible" donde puedes agregar muchos elementos
- Cuando haces `container.appendChild(fragment)`, todos los hijos se mueven al DOM de UNA sola vez
- Sin fragment, cada `container.appendChild(btn)` causaria un "reflow" del navegador (el navegador recalcula layout cada vez que agregas algo al DOM). Con fragment, solo hay UN reflow.

**`.find()` vs `.filter()`:**
- `.find()` retorna el PRIMER elemento que cumple la condicion (o undefined)
- `.filter()` retorna TODOS los elementos que cumplen la condicion (array)

**Template literals con condicionales:**
```javascript
`plp-size${v.available ? '' : ' out'}${isFirstAvailable ? ' active' : ''}`
// Si available=false y isFirstAvailable=false: "plp-size out"
// Si available=true y isFirstAvailable=true:   "plp-size active"
```

**`btn.dataset.variantId = v.id`:**
- `dataset` permite leer/escribir atributos `data-*` en HTML
- `dataset.variantId` en JS corresponde a `data-variant-id` en HTML (camelCase ↔ kebab-case)

---

## 11. Actualizacion de UI (precio, boton, imagen)

### updateAddButton — Habilitar/deshabilitar el boton

```javascript
function updateAddButton(productId, controller, colorAvailable = true) {
  const btn = controller.querySelector(CONFIG.SELECTORS.addToCartBtn);
  if (!btn) return;

  const state = selectedState[productId];
  const hasColors = controller.querySelector(CONFIG.SELECTORS.colorsContainer)?.children.length > 0;

  const isComplete = hasColors
    ? (state?.color && state?.size && state?.variantId)
    : (state?.size && state?.variantId);

  if (!colorAvailable) {
    btn.disabled = true;
    btn.classList.remove(CONFIG.CLASSES.ready);
    btn.classList.add(CONFIG.CLASSES.soldOut);
    btn.textContent = CONFIG.MESSAGES.soldOut;
    return;
  }

  btn.classList.remove(CONFIG.CLASSES.soldOut);
  btn.textContent = CONFIG.MESSAGES.addToBag;

  if (isComplete) {
    btn.disabled = false;
    btn.classList.add(CONFIG.CLASSES.ready);
  } else {
    btn.disabled = true;
    btn.classList.remove(CONFIG.CLASSES.ready);
  }
}
```

**Logica:**
- Si el color no tiene stock → "Agotado" (disabled)
- Si el producto tiene colores → necesita color + talla + variantId para habilitarse
- Si NO tiene colores → solo necesita talla + variantId

**`classList.toggle`, `classList.add`, `classList.remove`:**
```javascript
btn.classList.add('ready');      // Agrega la clase
btn.classList.remove('ready');   // Remueve la clase
btn.classList.toggle('ready', condition);  // Agrega si condition=true, remueve si false
```

### updatePrice — Actualizar precio visible

```javascript
function updatePrice(productId, variant) {
  if (!variant) return;

  const cache = getProductCache(productId);
  if (!cache?.priceContainer) return;

  const priceEl = cache.priceContainer.querySelector(CONFIG.SELECTORS.price);
  const compareAtPriceEl = cache.priceContainer.querySelector(CONFIG.SELECTORS.compareAtPrice);

  if (priceEl) {
    priceEl.textContent = variant.priceFormatted;
  }

  if (compareAtPriceEl?.parentElement) {
    const hasCompare = variant.compareAtPrice && variant.compareAtPrice > variant.price;
    compareAtPriceEl.textContent = hasCompare ? variant.compareAtPriceFormatted : '';
    compareAtPriceEl.parentElement.style.display = hasCompare ? '' : 'none';
  }
}
```

**`style.display = ''`:** Poner un string vacio REMUEVE el style inline, dejando que el CSS original controle la visibilidad. Es diferente de `style.display = 'block'` que fuerza block.

### changeImage — Cambiar imagen de la card

```javascript
function changeImage(productId, variant) {
  const cache = getProductCache(productId);
  if (!cache?.cardGallery) return;

  const slideshow = cache.cardGallery.querySelector(CONFIG.SELECTORS.slideshow);
  if (!slideshow) return;

  const slides = slideshow.querySelectorAll(CONFIG.SELECTORS.slide);
  if (slides.length < 1) return;

  const [firstSlide, secondSlide] = slides;  // Destructuring
  const baseImg = firstSlide?.querySelector('img');
  const hoverImg = secondSlide?.querySelector('img');

  if (!baseImg) return;

  // Reset slides
  if (firstSlide) {
    firstSlide.setAttribute('aria-hidden', 'false');
    firstSlide.removeAttribute('hidden');
  }
  if (secondSlide) {
    secondSlide.setAttribute('aria-hidden', 'true');
    secondSlide.removeAttribute('hidden');
  }

  // Galeria del metafield
  if (variant.gallery?.length) {
    const baseSrc = variant.gallery[0];
    baseImg.src = getImageUrl(baseSrc, 800);
    baseImg.srcset = generateSrcset(baseSrc);

    if (variant.gallery[1] && hoverImg) {
      const hoverSrc = variant.gallery[1];
      new Image().src = getImageUrl(hoverSrc, 800);  // Preload
      hoverImg.src = getImageUrl(hoverSrc, 800);
      hoverImg.srcset = generateSrcset(hoverSrc);
    }
    return;
  }

  // Fallback: featured_media
  if (variant.featured_media?.src) {
    baseImg.src = getImageUrl(variant.featured_media.src, 800);
    baseImg.srcset = generateSrcset(variant.featured_media.src);
  }
}
```

**Destructuring de array:**
```javascript
const [firstSlide, secondSlide] = slides;
// Es equivalente a:
// const firstSlide = slides[0];
// const secondSlide = slides[1];
```

**`new Image().src = url`:** Crea una imagen invisible y le pone src. El navegador la descarga y la mete en cache. Es un truco clasico para precargar.

---

## 12. Galeria por color (slideshow)

### getColorGallery — Buscar imagenes de un color

```javascript
function getColorGallery(productId, color) {
  const product = window.PLP?.[productId];
  if (!product) return null;

  const colorVariants = product.variants.filter(v => v.options.includes(color));

  for (const variant of colorVariants) {
    if (variant.gallery && variant.gallery.length > 0) {
      return variant.gallery;
    }
  }

  return null;
}
```

**`for...of`:** Itera sobre elementos de un array. La ventaja sobre `.forEach()` es que puedes usar `return` para salir de la funcion completa (con `.forEach()`, `return` solo sale del callback actual).

### rebuildSlideshowForColor — Reconstruir el carrusel

```javascript
function rebuildSlideshowForColor(productId, color) {
  const gallery = getColorGallery(productId, color);
  if (!gallery || gallery.length === 0) return;

  const cache = getProductCache(productId);
  if (!cache?.cardGallery) return;

  const slideshow = cache.cardGallery.querySelector(CONFIG.SELECTORS.slideshow);
  if (!slideshow) return;

  const scroller = slideshow.querySelector('[ref="scroller"]');
  if (!scroller) return;

  const fragment = document.createDocumentFragment();

  gallery.forEach((src, index) => {
    // Crear el slide
    const slide = document.createElement('slideshow-slide');
    slide.setAttribute('ref', 'slides[]');
    slide.setAttribute('aria-hidden', index === 0 ? 'false' : 'true');
    slide.setAttribute('slide-id', `variant-gallery-${productId}-${index}`);
    slide.className = 'product-media-container media-fit product-media-container--image';
    slide.style.cssText = `view-timeline-name: --slide-${index}; --product-media-fit: cover;`;

    if (index >= 5) {
      slide.setAttribute('hidden', '');
    }

    // Crear la imagen dentro del slide
    const img = document.createElement('img');
    img.src = getImageUrl(src, 800);
    img.srcset = generateSrcset(src);
    img.sizes = '(min-width: 750px) 50vw, 100vw';
    img.loading = index === 0 ? 'eager' : 'lazy';
    img.alt = `${color} - Image ${index + 1}`;
    img.className = 'product-media';

    slide.appendChild(img);
    fragment.appendChild(slide);
  });

  scroller.innerHTML = '';
  scroller.appendChild(fragment);

  slideshow.setAttribute('slide-count', String(gallery.length));
  slideshow.setAttribute('initial-slide', '0');

  // Re-inicializar el slideshow
  if (typeof slideshow.select === 'function') {
    requestAnimationFrame(() => {
      try {
        slideshow.select(0, null, { animate: false });
      } catch (e) {}
    });
  }
}
```

**`style.cssText`:** Permite poner todo el style inline de una vez como string, en vez de hacer `style.color = 'red'; style.margin = '10px';` uno por uno.

**`img.loading = 'lazy'`:** Le dice al navegador que no descargue la imagen hasta que este cerca de ser visible. La primera imagen es 'eager' (descargar ya).

**`requestAnimationFrame`:** Ejecuta el callback justo antes del siguiente repaint del navegador. Se usa cuando necesitas que el DOM ya este actualizado antes de hacer algo. Aqui, primero se agregan los slides y DESPUES se le dice al slideshow que seleccione el slide 0.

**`typeof slideshow.select === 'function'`:** Verifica que el slideshow (custom element del tema) ya este inicializado y tenga el metodo `select`. Si no, no hace nada (puede que el Web Component aun no haya hecho `connectedCallback`).

---

## 13. Carrito: addToCart y updateCartCount

### addToCart — Agregar al carrito via API

```javascript
async function addToCart(variantId) {
  // Cancelar peticion anterior
  if (currentFetchController) {
    currentFetchController.abort();
  }
  currentFetchController = new AbortController();

  const response = await fetch('/cart/add.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: variantId, quantity: 1 }),
    signal: currentFetchController.signal
  });

  currentFetchController = null;

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.description || CONFIG.MESSAGES.error);
  }

  return response.json();
}
```

**`async/await`:**
- `async function` permite usar `await` adentro
- `await fetch(...)` pausa la ejecucion hasta que la peticion termine
- Sin async/await, tendrias que usar `.then().catch()` (mas verboso)

**`AbortController`:**
```javascript
const controller = new AbortController();
fetch(url, { signal: controller.signal });  // Asociar el signal al fetch
controller.abort();  // Cancela la peticion
```
Si el usuario hace doble click rapido, la primera peticion se cancela. El fetch lanza un error con `name: 'AbortError'`, que se maneja despues.

**`JSON.stringify()`:** Convierte un objeto JavaScript a string JSON para enviarlo en el body del fetch.

**`response.ok`:** Es `true` si el status HTTP esta entre 200-299. Si Shopify responde con 422 (variante no disponible), `ok` es false.

**`throw new Error(...)`:** Lanza un error que sera capturado por el `try/catch` de quien llame a `addToCart()`.

### updateCartCount — Actualizar la burbuja del carrito

```javascript
async function updateCartCount() {
  try {
    const response = await fetch('/cart.js');
    const cart = await response.json();
    const count = cart.item_count;

    // Actualizar DOM directamente
    const bubbleCount = document.querySelector('[ref="cartBubbleCount"]');
    const bubble = document.querySelector('[ref="cartBubble"]');
    if (bubbleCount) {
      bubbleCount.textContent = count < 100 ? String(count) : '';
      bubbleCount.classList.toggle('hidden', count === 0);
    }
    if (bubble) {
      bubble.classList.toggle('visually-hidden', count === 0);
    }

    // Persistir en sessionStorage
    sessionStorage.setItem('cart-count', JSON.stringify({
      value: String(count),
      timestamp: Date.now()
    }));

    // Despachar evento del tema
    document.dispatchEvent(new CustomEvent('cart:update', {
      detail: { data: { itemCount: count, source: 'plp-variants' } }
    }));
  } catch (err) {
    console.error('Error updating cart count:', err);
  }
}
```

**`sessionStorage`:** Almacenamiento en el navegador que dura hasta que se cierra la pestana. A diferencia de `localStorage`, no persiste entre sesiones. Solo acepta strings, por eso se usa `JSON.stringify` para guardar y `JSON.parse` para leer.

**`CustomEvent`:** Crea un evento personalizado que puede llevar datos en `detail`:
```javascript
document.dispatchEvent(new CustomEvent('cart:update', {
  detail: { data: { itemCount: 5 } }
}));

// Otro componente puede escucharlo:
document.addEventListener('cart:update', (event) => {
  console.log(event.detail.data.itemCount); // 5
});
```

---

## 14. Event Handlers: color, talla, add to cart

### handleColorClick — Cuando el usuario clickea un color

```javascript
function handleColorClick(btn) {
  const productId = btn.dataset.productId;
  const color = btn.dataset.color;
  const colorAvailable = btn.dataset.available === 'true';
  const product = window.PLP?.[productId];

  if (!product) return;

  const state = initProductState(productId);
  state.color = color;
  state.size = null;       // Reset porque las tallas cambian con el color
  state.variantId = null;

  // Marcar color activo
  const controller = btn.closest(CONFIG.SELECTORS.controller);
  controller.querySelectorAll(CONFIG.SELECTORS.colorBtn).forEach(c => {
    c.classList.remove(CONFIG.CLASSES.active);
  });
  btn.classList.add(CONFIG.CLASSES.active);

  // Filtrar variantes por color
  const variants = product.variants.filter(v => v.options.includes(color));

  // Actualizar todo
  renderSizes(productId, variants, controller);
  changeImage(productId, variants[0]);
  updatePrice(productId, variants[0]);
  updateAddButton(productId, controller, colorAvailable);
  rebuildSlideshowForColor(productId, color);

  const targetVariant = state.variantId || variants.find(v => v.available)?.id;
  if (targetVariant) {
    updateProductLinks(productId, targetVariant);
  }
}
```

**Flujo resumido:**
1. Leer datos del boton clickeado
2. Actualizar estado (reset talla porque las tallas dependen del color)
3. Quitar class `active` de TODOS los colores, poner en el clickeado
4. Filtrar variantes del objeto `window.PLP` que tengan ese color
5. Reconstruir botones de talla
6. Actualizar imagen, precio, boton, slideshow, y enlaces

**`btn.dataset.available === 'true'`:** Los atributos `data-*` siempre son strings. Aunque en Liquid escribas `data-available="true"` (boolean), en JS llega como string `"true"`, por eso se compara con el string `'true'`.

### handleAddToCartClick — Cuando el usuario clickea "Agregar a la bolsa"

```javascript
async function handleAddToCartClick(btn) {
  if (btn.disabled) return;

  const productId = btn.dataset.productId;
  const state = selectedState[productId];

  if (!state?.variantId) {
    showMessage(btn, CONFIG.MESSAGES.selectVariant);
    return;
  }

  btn.disabled = true;
  const originalContent = btn.innerHTML;
  btn.innerHTML = '<span class="plp-spinner"></span>';

  try {
    await addToCart(state.variantId);

    btn.innerHTML = CONFIG.MESSAGES.added;
    btn.classList.add(CONFIG.CLASSES.success);
    updateCartCount();

    resetButtonState(btn, originalContent, [CONFIG.CLASSES.success]);
  } catch (err) {
    if (err.name === 'AbortError') return;

    console.error('Add to cart error:', err);
    btn.innerHTML = err.message || CONFIG.MESSAGES.error;
    btn.classList.add(CONFIG.CLASSES.error);

    resetButtonState(btn, originalContent, [CONFIG.CLASSES.error]);
  }
}
```

**Flujo visual del boton:**
```
"Agregar a la bolsa →"  →  [spinner]  →  "¡Agregado! ✓" (verde)  →  "Agregar a la bolsa →"
                                      →  "Error..." (rojo)       →  "Agregar a la bolsa →"
```

**`btn.innerHTML` vs `btn.textContent`:**
- `textContent` = solo texto plano
- `innerHTML` = puede incluir HTML (como el `<span class="plp-spinner">`)

**`err.name === 'AbortError'`:** Cuando cancelas un fetch con AbortController, el error tiene name "AbortError". Se ignora porque no es un error real, el usuario simplemente hizo click de nuevo.

---

## 15. Event Delegation: como se capturan los clicks

```javascript
function handleDocumentClick(e) {
  const target = e.target;
  if (!(target instanceof Element)) return;

  // Click en color
  const colorBtn = target.closest(CONFIG.SELECTORS.colorBtn);
  if (colorBtn) {
    handleColorClick(colorBtn);
    return;
  }

  // Click en talla
  const sizeBtn = target.closest(`${CONFIG.SELECTORS.sizeBtn}:not(.${CONFIG.CLASSES.out})`);
  if (sizeBtn) {
    handleSizeClick(sizeBtn);
    return;
  }

  // Click en agregar al carrito
  const addBtn = target.closest(CONFIG.SELECTORS.addToCartBtn);
  if (addBtn) {
    handleAddToCartClick(addBtn);
    return;
  }
}

// Se registra UNA sola vez:
document.addEventListener('click', handleDocumentClick);
```

**Que es Event Delegation:**

En vez de poner un `addEventListener` en CADA boton (podrian ser 50+ botones en una coleccion), pones UNO solo en `document`. Cuando el usuario hace click en cualquier lugar, el evento "burbujea" (sube) desde el elemento clickeado hasta `document`.

**`target.closest(selector)`:** Busca hacia arriba en el DOM desde el elemento clickeado. Si hago click en el `<span>` dentro de un `.plp-color`, `target` es el `<span>`, pero `target.closest('.plp-color')` encuentra el boton padre.

**Ventajas de Event Delegation:**
1. **Performance**: 1 listener vs 50+ listeners
2. **Elementos dinamicos**: Los botones de talla se destruyen y recrean cuando cambias de color. Con event delegation no necesitas re-agregar listeners
3. **Menos memoria**: Menos funciones en memoria

**`return` al final de cada bloque:** Evita que se sigan evaluando las demas condiciones. Si ya encontro que es un click en color, no necesita verificar si es talla o add-to-cart.

---

## 16. Hover: imagenes y preload

```javascript
function handleImageHover(e, isEnter) {
  const target = e.target;
  if (!(target instanceof Element)) return;

  const card = target.closest(CONFIG.SELECTORS.productCard);
  if (!card) return;

  const hoverImage = card._hoverImage;
  const baseImage = card._baseImage;

  if (isEnter && !hoverImage) return;
  if (!isEnter && !baseImage) return;
  if (!isEnter && card.contains(e.relatedTarget)) return;

  const slideshow = card.querySelector(CONFIG.SELECTORS.slideshow);
  const active = slideshow.querySelector(`${CONFIG.SELECTORS.slide}[aria-hidden='false']`);
  const img = active.querySelector('img');

  const src = isEnter ? hoverImage : baseImage;
  img.src = getImageUrl(src, 800);
  img.srcset = generateSrcset(src);
}
```

**`card._hoverImage` y `card._baseImage`:** Propiedades custom puestas directamente en el elemento DOM. JavaScript permite agregar propiedades arbitrarias a cualquier objeto, incluyendo elementos HTML. El prefijo `_` es convencion para indicar que es "privada/interna".

**`e.relatedTarget`:** En un evento `mouseout`, `relatedTarget` es el elemento al que el mouse SE MUEVE. `card.contains(e.relatedTarget)` verifica si el mouse se movio a otro elemento DENTRO de la misma card (en cuyo caso no debemos revertir la imagen).

**Registro de hover:**
```javascript
document.addEventListener('mouseover', e => {
  handleImageHover(e, true);   // Hover enter
  handleColorHover(e);          // Preload de color
  handleCardHover(e);           // Preload de toda la card
});
document.addEventListener('mouseout', e => handleImageHover(e, false));  // Hover leave
```

Los 3 handlers de hover comparten el mismo listener de `mouseover`. Esto es eficiente porque:
- Un solo listener para 3 funcionalidades
- Event delegation aplica igual para mouseover/mouseout

---

## 17. Inicializacion

```javascript
function init() {
  // Pre-configurar estado para cada product card
  document.querySelectorAll(CONFIG.SELECTORS.controller).forEach(controller => {
    const productId = controller.dataset.productId;
    const firstVariantId = controller.dataset.firstVariantId;
    const firstColor = controller.dataset.firstColor;

    if (productId && firstVariantId) {
      const state = initProductState(productId);
      state.variantId = firstVariantId;
      state.color = firstColor || null;

      const activeSize = controller.querySelector(
        `${CONFIG.SELECTORS.sizeBtn}.${CONFIG.CLASSES.active}`
      );
      if (activeSize) {
        state.size = activeSize.textContent.trim();
      }

      updateProductLinks(productId, firstVariantId);

      // Reconstruir slideshow con delay
      if (firstColor) {
        const rebuild = () => rebuildSlideshowForColor(productId, firstColor);
        if ('requestIdleCallback' in window) {
          requestIdleCallback(rebuild, { timeout: 500 });
        } else {
          setTimeout(rebuild, 100);
        }
      }
    }
  });

  // Registrar event listeners
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('mouseover', e => { ... });
  document.addEventListener('mouseout', e => handleImageHover(e, false));
}

// Ejecutar cuando el DOM este listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
```

**`document.readyState`:**
- `'loading'` = el HTML se esta parseando todavia
- `'interactive'` = el HTML ya se parseo, pero imagenes/styles pueden seguir cargando
- `'complete'` = todo cargado

Si el script se ejecuta antes de que el DOM este listo, espera al evento `DOMContentLoaded`. Si ya esta listo (porque el script tiene `defer` o esta al final del body), ejecuta `init()` inmediatamente.

---

## 18. API publica

```javascript
window.PLPVariants = {
  invalidateCache,
  updateProductLinks,
  getState: (productId) => selectedState[productId],
  getColorGallery,
  rebuildSlideshowForColor
};
```

Estas funciones se exponen en `window` para que otros scripts puedan usarlas:

```javascript
// Desde la consola del navegador o desde otro script:
window.PLPVariants.getState("123456")
// → { color: "Negro", size: "M", variantId: "44012345" }

window.PLPVariants.rebuildSlideshowForColor("123456", "Azul")
// → Reconstruye el carrusel con las imagenes del color Azul
```

---

## 19. Conceptos de JavaScript usados

### Resumen de conceptos

| Concepto | Donde se usa | Que hace |
|---|---|---|
| IIFE | Todo el archivo | Encapsula el codigo, evita contaminar scope global |
| `'use strict'` | Inicio del IIFE | Activa modo estricto (errores mas claros) |
| `const` / `let` | Variables | `const` = no se puede reasignar; `let` = si se puede |
| Arrow functions `=>` | Callbacks | Forma corta de escribir funciones |
| Template literals `` ` ` `` | Strings con variables | Permiten interpolacion `${variable}` |
| Optional chaining `?.` | Acceso seguro a propiedades | Retorna undefined en vez de error si algo es null |
| Destructuring `[a, b]` | Extraer valores | Asigna elementos de array/objeto a variables |
| Spread `...` | Combinar arrays/objetos | Expande un iterable en otro |
| `async/await` | Peticiones HTTP | Manejo asincrono legible |
| `Promise` | Preload de imagenes | Representar operaciones futuras |
| `Map` / `Set` | Caches | Map = pares key/value; Set = valores unicos |
| `fetch` | API de Shopify | Peticiones HTTP nativas |
| `AbortController` | Cancelar fetch | Cancela peticiones en curso |
| Event delegation | Clicks, hovers | Un listener en document para todos los botones |
| `closest()` | Event handlers | Buscar ancestro que matchee un selector |
| `DocumentFragment` | renderSizes, rebuildSlideshow | Agregar muchos elementos de una sola vez |
| `requestAnimationFrame` | Slideshow | Ejecutar despues del siguiente repaint |
| `requestIdleCallback` | Preload | Ejecutar cuando el navegador este libre |
| `sessionStorage` | Cart count | Persistir datos durante la sesion |
| `CustomEvent` | Cart update | Comunicacion entre componentes via eventos |
| `dataset` | Leer data-* attributes | Interfaz JS para atributos data de HTML |
| `classList` | Toggle clases CSS | Agregar/remover/verificar clases CSS |
| `innerHTML` vs `textContent` | Actualizar contenido | HTML vs texto plano |
| `try/catch` | Manejo de errores | Capturar errores sin que la app se rompa |
| `typeof` | Verificacion de tipo | Comprobar si algo es function/string/etc |
