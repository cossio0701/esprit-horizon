(function () {
  "use strict";

  var CACHE_PREFIX = "siblings_v2_";

  function cacheKey(styleRef) {
    return CACHE_PREFIX + styleRef;
  }

  function getFromCache(styleRef) {
    try {
      var raw = sessionStorage.getItem(cacheKey(styleRef));
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  function saveToCache(styleRef, products) {
    try {
      sessionStorage.setItem(cacheKey(styleRef), JSON.stringify(products));
    } catch (e) {}
  }

  var pendingFetches = {};

  function filterSiblings(products, styleRef) {
    var erpPrefix = styleRef + "-";
    var styleRefLower = styleRef.toLowerCase();
    return products.filter(function (p) {
      if (p.tags && p.tags.length) {
        return p.tags.some(function (t) {
          return t.indexOf(erpPrefix) === 0;
        });
      }
      return p.handle.indexOf(styleRefLower) !== -1;
    });
  }

  // ---------------------------------------------------------------------------
  // Storefront API fetch
  // ---------------------------------------------------------------------------

  var USE_STOREFRONT_API = !!(
    window.STOREFRONT_ACCESS_TOKEN &&
    window.STOREFRONT_ACCESS_TOKEN.length > 10 &&
    window.STOREFRONT_DOMAIN
  );

  // Normalize a Storefront API product node to a common shape
  // compatible with the predictive search shape (featured_image.url, variants[])
  // plus two new fields: colorHex and colorName from optionValues.swatch.
  function normalizeFromStorefront(node) {
    var colorHex = null;
    var colorName = null;

    if (node.options) {
      for (var i = 0; i < node.options.length; i++) {
        var opt = node.options[i];
        var nameLower = opt.name.toLowerCase();
        if (nameLower === "color" || nameLower === "colour") {
          if (opt.optionValues && opt.optionValues.length > 0) {
            colorName = opt.optionValues[0].name;
            if (
              opt.optionValues[0].swatch &&
              opt.optionValues[0].swatch.color
            ) {
              colorHex = opt.optionValues[0].swatch.color;
            }
          }
          break;
        }
      }
    }

    return {
      handle: node.handle,
      title: node.title,
      tags: node.tags || [],
      featured_image: (function () {
        var edges = node.images && node.images.edges;
        var img = (edges && edges[1]) || (edges && edges[0]);
        return img ? { url: img.node.url } : null;
      })(),

      variants:
        node.variants && node.variants.edges
          ? node.variants.edges.map(function (e) {
              return { title: e.node.title };
            })
          : [],
      colorHex: colorHex,
      colorName: colorName,
      available: node.availableForSale !== false,
    };
  }

  function fetchViaSfAPI(styleRef) {
    var query =
      '{ products(first: 20, query: "' +
      styleRef +
      '") {' +
      "  edges { node {" +
      "    handle title tags availableForSale" +
      "    images(first: 2) { edges { node { url } } }" +
      "    options { name optionValues { name swatch { color } } }" +
      "    variants(first: 1) { edges { node { title } } }" +
      "  } }" +
      "} }";

    console.log("[color-siblings] Storefront API fetch", styleRef);

    return fetch(
      "https://" + window.STOREFRONT_DOMAIN + "/api/2024-07/graphql.json",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": window.STOREFRONT_ACCESS_TOKEN,
        },
        body: JSON.stringify({ query: query }),
      },
    )
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (json) {
        if (json.errors) throw new Error(json.errors[0].message);

        var edges =
          (json.data && json.data.products && json.data.products.edges) || [];
        var products = filterSiblings(
          edges.map(function (e) {
            return normalizeFromStorefront(e.node);
          }),
          styleRef,
        );

        console.log(
          "[color-siblings] SF API",
          styleRef,
          "\u2192",
          edges.length,
          "resultados,",
          products.length,
          "hermanos",
        );
        return products;
      });
  }

  // ---------------------------------------------------------------------------
  // Predictive search fetch (fallback)
  // ---------------------------------------------------------------------------

  function fetchViaPredictive(styleRef) {
    var params = [
      "q=" + encodeURIComponent(styleRef),
      "resources[type]=product",
      "resources[limit]=20",
      "resources[options][fields]=tag",
      "resources[options][unavailable_products]=show",
    ].join("&");

    console.log("[color-siblings] predictive search fetch", styleRef);

    return fetch("/search/suggest.json?" + params)
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (json) {
        var results =
          (json.resources &&
            json.resources.results &&
            json.resources.results.products) ||
          [];

        var products = filterSiblings(results, styleRef);

        console.log(
          "[color-siblings] predictive",
          styleRef,
          "\u2192",
          results.length,
          "resultados,",
          products.length,
          "hermanos",
        );
        return products;
      });
  }

  // ---------------------------------------------------------------------------
  // Main fetch — Storefront API with automatic fallback to predictive search
  // ---------------------------------------------------------------------------

  function fetchSiblings(styleRef) {
    var cached = getFromCache(styleRef);
    if (cached) return Promise.resolve(cached);
    if (pendingFetches[styleRef]) return pendingFetches[styleRef];

    var primaryFetch = USE_STOREFRONT_API
      ? fetchViaSfAPI(styleRef)
      : fetchViaPredictive(styleRef);

    var promise = primaryFetch
      .catch(function (err) {
        console.warn(
          "[color-siblings] SF API falló, usando predictive search:",
          err.message,
        );
        if (USE_STOREFRONT_API) return fetchViaPredictive(styleRef);
        return null;
      })
      .then(function (products) {
        if (products) saveToCache(styleRef, products);
        delete pendingFetches[styleRef];
        return products;
      })
      .catch(function (err) {
        console.error("[color-siblings] fetch falló:", styleRef, err);
        delete pendingFetches[styleRef];
        return null;
      });

    pendingFetches[styleRef] = promise;
    return promise;
  }

  // ---------------------------------------------------------------------------
  // Helpers — colorName and colorHex aware of normalized shape
  // ---------------------------------------------------------------------------

  // Returns the color name for a product.
  // For Storefront API products: uses normalized colorName field.
  // For predictive search products: parses variant title.
  function getColorName(product) {
    if (product.colorName) return product.colorName;
    if (product.variants && product.variants.length > 0) {
      var variantTitle = product.variants[0].title;
      if (variantTitle && variantTitle !== "Default Title") {
        var parts = variantTitle.split(" / ");
        return parts[parts.length - 1];
      }
    }
    return product.title;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  function renderSwatches(container, siblings, currentHandle) {
    container
      .querySelectorAll(".color-siblings__skeleton")
      .forEach(function (el) {
        el.remove();
      });

    if (!siblings || siblings.length === 0) {
      return;
    }

    var swatchStyle = container.dataset.swatchStyle || "image";

    var otherSiblings = siblings.filter(function (s) {
      return s.handle !== currentHandle && s.available !== false;
    });

    if (otherSiblings.length === 0) {
      return;
    }

    otherSiblings.forEach(function (sibling) {
      var colorName = getColorName(sibling);
      var link = document.createElement("a");
      link.href = "/products/" + sibling.handle;
      link.className = "color-siblings__swatch";
      link.setAttribute("aria-label", colorName);
      link.setAttribute("title", colorName);
      link.dataset.handle = sibling.handle;

      if (swatchStyle === "color") {
        var hex = sibling.colorHex || null;
        var dot = document.createElement("span");
        dot.className = hex
          ? "color-siblings__swatch-dot"
          : "color-siblings__swatch-fallback";
        if (hex) dot.style.backgroundColor = hex;
        link.appendChild(dot);
      } else {
        var imgObj = sibling.featured_image || sibling.image;
        var imgUrl = imgObj && imgObj.url;
        if (imgUrl) {
          var media = document.createElement("span");
          media.className = "color-siblings__swatch-media";
          var img = document.createElement("img");
          img.src = imgUrl;
          img.alt = colorName;
          img.loading = "lazy";
          img.className = "color-siblings__swatch-img";
          media.appendChild(img);
          link.appendChild(media);
        } else {
          var fallback = document.createElement("span");
          fallback.className = "color-siblings__swatch-fallback";
          link.appendChild(fallback);
        }
      }

      container.appendChild(link);
    });
  }

  function showSkeletons(container) {
    for (var i = 0; i < 3; i++) {
      var skeleton = document.createElement("span");
      skeleton.className = "color-siblings__swatch color-siblings__skeleton";
      skeleton.setAttribute("aria-hidden", "true");
      var inner = document.createElement("span");
      inner.className =
        "color-siblings__swatch-fallback color-siblings__swatch-fallback--skeleton";
      skeleton.appendChild(inner);
      container.appendChild(skeleton);
    }
  }

  function getBreadcrumbSectionId() {
    var el = document.querySelector('[class*="product-breadcrumb-section-"]');
    if (!el) return null;
    var wrapper = el.closest('[id^="shopify-section-"]');
    if (!wrapper) return null;
    return wrapper.id.replace("shopify-section-", "");
  }

  function rerunScripts(container) {
    container.querySelectorAll("script").forEach(function (oldScript) {
      var newScript = document.createElement("script");
      Array.from(oldScript.attributes).forEach(function (attr) {
        newScript.setAttribute(attr.name, attr.value);
      });
      newScript.textContent = oldScript.textContent;
      oldScript.parentNode.replaceChild(newScript, oldScript);
    });
  }

  function findCardParent(el) {
    var node = el.parentElement;
    while (node && node !== document.body) {
      var tag = node.tagName;
      var cls = typeof node.className === "string" ? node.className : "";
      if (
        tag === "LI" ||
        tag === "ARTICLE" ||
        tag === "PRODUCT-CARD" ||
        cls.indexOf("product-card") !== -1 ||
        cls.indexOf("product-item") !== -1 ||
        cls.indexOf("grid-item") !== -1 ||
        cls.indexOf("card--product") !== -1
      ) {
        return node;
      }
      node = node.parentElement;
    }
    return el.parentElement;
  }

  function initPDP() {
    var container = document.querySelector('[data-style-ref][data-mode="pdp"]');
    if (!container) return;
    console.log("[color-siblings] initPDP:", container.dataset.styleRef);

    var styleRef = container.dataset.styleRef;
    var currentHandle = container.dataset.currentHandle;
    var sectionId = container.dataset.sectionId;

    showSkeletons(container);

    fetchSiblings(styleRef).then(function (siblings) {
      if (!siblings) {
        container
          .querySelectorAll(".color-siblings__skeleton")
          .forEach(function (el) {
            el.remove();
          });
        return;
      }
      renderSwatches(container, siblings, currentHandle);
    });

    container.addEventListener("click", function (e) {
      var swatch = e.target.closest(".color-siblings__swatch");
      if (!swatch) return;
      if (swatch.getAttribute("aria-current") === "true") return;
      if (!sectionId) return;

      e.preventDefault();

      var handle = swatch.dataset.handle;
      var breadcrumbSectionId = getBreadcrumbSectionId();
      var sectionsParam = breadcrumbSectionId
        ? sectionId + "," + breadcrumbSectionId
        : sectionId;

      container.classList.add("color-siblings--loading");

      fetch("/products/" + handle + "?sections=" + sectionsParam)
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        })
        .then(function (data) {
          var wrapper = document.getElementById("shopify-section-" + sectionId);
          if (wrapper && data[sectionId]) {
            wrapper.innerHTML = data[sectionId];
            rerunScripts(wrapper);
            history.pushState({}, "", "/products/" + handle);
            var titleEl = wrapper.querySelector("[data-product-title]");
            if (titleEl) document.title = titleEl.dataset.productTitle;
            if (breadcrumbSectionId && data[breadcrumbSectionId]) {
              var breadcrumbWrapper = document.getElementById(
                "shopify-section-" + breadcrumbSectionId,
              );
              if (breadcrumbWrapper)
                breadcrumbWrapper.innerHTML = data[breadcrumbSectionId];
            }
            initPDP();
          } else {
            window.location.href = "/products/" + handle;
          }
        })
        .catch(function () {
          window.location.href = "/products/" + handle;
        });
    });
  }

  function initPLP() {
    var cardContainers = document.querySelectorAll(
      '[data-style-ref][data-mode="card"]',
    );
    console.log(
      "[color-siblings] initPLP:",
      cardContainers.length,
      "containers",
    );
    cardContainers.forEach(function (container) {
      var card = findCardParent(container);
      card.addEventListener("mouseenter", function () {
        if (container.dataset.loaded) return;
        var styleRef = container.dataset.styleRef;
        var currentHandle = container.dataset.currentHandle;
        fetchSiblings(styleRef).then(function (siblings) {
          if (!siblings) return;
          renderSwatches(container, siblings, currentHandle);
          container.dataset.loaded = "true";
        });
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      initPDP();
      initPLP();
    });
  } else {
    initPDP();
    initPLP();
  }
})();
