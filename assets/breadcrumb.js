/**
 * Breadcrumb — Resolver + Renderer
 *
 * Depende de: category-tree.js (ShopifyBreadcrumb.Tree)
 * Cargar DESPUÉS de category-tree.js.
 *
 * Resolver: resuelve paths de breadcrumb usando índices O(1)
 *           + validación de continuidad padre→hijo
 * Renderer: renderiza items en el DOM
 */
(function () {
  'use strict';

  window.ShopifyBreadcrumb = window.ShopifyBreadcrumb || {};

  /* ============================================
     BreadcrumbResolver — Puro (sin DOM)
     ============================================ */

  var BreadcrumbResolver = {

    resolveCollection: function (handle, tree) {
      if (!handle || !tree) return null;

      var match = tree.lookupByUrl('/collections/' + handle);
      if (!match) {
        match = tree.lookupByUrl(handle);
      }

      if (!match || !match.path || match.path.length === 0) return null;

      return this._buildPath(match.path, { isPDP: false });
    },

    resolveProduct: function (tagPath, tree, productInfo) {
      if (!tagPath || !tree) return null;

      productInfo = productInfo || {};

      var normalized = this._normalizeTag(tagPath);

      var match = tree.lookupByTag(normalized);

      if (match && match.path && match.path.length > 0) {
        return this._buildPath(match.path, {
          isPDP: true,
          productTitle: productInfo.title,
          productUrl: productInfo.url
        });
      }

      var partialMatch = this._findPartialTagMatch(normalized, tree);
      if (partialMatch) {
        return this._buildPath(partialMatch.path, {
          isPDP: true,
          productTitle: productInfo.title,
          productUrl: productInfo.url
        });
      }

      var nameMatch = this._resolveByNames(normalized, tree);
      if (nameMatch && nameMatch.path && nameMatch.path.length > 0) {
        return this._buildPath(nameMatch.path, {
          isPDP: true,
          productTitle: productInfo.title,
          productUrl: productInfo.url
        });
      }

      if (productInfo.title) {
        return [{
          name: productInfo.title,
          url: productInfo.url || '',
          isClickable: false,
          isCurrent: true,
          position: 2
        }];
      }

      return null;
    },

    _normalizeTag: function (tagPath) {
      if (!tagPath) return '';
      return tagPath.toLowerCase().trim();
    },

    /**
     * Intenta resolver un tag path por nombre exacto de nodo.
     * Solo matching exacto (sin espacios/underscores).
     * NO hace fuzzy/partial match — mejor no match que ruta incorrecta.
     * VALIDA continuidad padre→hijo: si los nodos no forman una cadena
     * jerárquica válida, retorna null.
     */
    _resolveByNames: function (tagPath, tree) {
      var parts = tagPath.split('/');
      var byName = tree.indices && tree.indices.byName;
      if (!byName) return null;

      // Paso 1: encontrar nodos por nombre exacto
      var nodes = [];
      for (var i = 0; i < parts.length; i++) {
        var part = parts[i].toLowerCase().trim();
        var match = byName.get(part.replace(/[_\s]+/g, ''));

        if (!match) {
          match = byName.get(part.replace(/\s+/g, '_'));
        }

        // NO fuzzy/partial match — fail fast
        if (!match) return null;

        nodes.push(match.node);
      }

      if (nodes.length === 0) return null;

      // Paso 2: validar continuidad padre→hijo
      // Cada nodo debe ser hijo directo del anterior
      for (var j = 1; j < nodes.length; j++) {
        var parent = nodes[j - 1];
        var child = nodes[j];
        if (!parent.child || parent.child.indexOf(child) === -1) {
          return null; // No hay continuidad jerárquica
        }
      }

      // Paso 3: construir path con entries válidos
      var result = [];
      for (var k = 0; k < nodes.length; k++) {
        result.push({ node: nodes[k], path: nodes.slice(0, k + 1), depth: k });
      }

      return result[result.length - 1];
    },

    _findPartialTagMatch: function (tagPath, tree) {
      var parts = tagPath.split('/');

      for (var i = parts.length - 1; i >= 0; i--) {
        var partialTag = parts.slice(0, i + 1).join('/');
        var match = tree.lookupByTag(partialTag);
        if (match && match.path && match.path.length > 0) {
          return match;
        }
      }

      return null;
    },

    _buildPath: function (pathArray, options) {
      options = options || {};
      var isPDP = options.isPDP || false;
      var items = [];
      var position = 2;

      for (var i = 0; i < pathArray.length; i++) {
        var node = pathArray[i];
        var isLastCategory = i === pathArray.length - 1;

        var shouldBeClickable = !!node.url && (isPDP || !isLastCategory);
        var isCurrent = !isPDP && isLastCategory;

        items.push({
          name: node.name || '',
          url: node.url || '',
          tag: node.tag || '',
          id: node.id || '',
          isClickable: shouldBeClickable,
          isCurrent: isCurrent,
          position: position
        });

        position++;
      }

      if (isPDP && options.productTitle) {
        items.push({
          name: options.productTitle,
          url: options.productUrl || '',
          isClickable: false,
          isCurrent: true,
          position: position
        });
      }

      return items;
    },

    resolveFallback: function (title, url) {
      return [{
        name: title || '',
        url: url || '',
        isClickable: false,
        isCurrent: true,
        position: 2
      }];
    }
  };

  window.ShopifyBreadcrumb.Resolver = BreadcrumbResolver;

  /* ============================================
     BreadcrumbRenderer — Puro y Stateless
     ============================================ */

  var SCHEMA_ITEM = 'https://schema.org/ListItem';

  var DATA_DYNAMIC = 'data-breadcrumb-dynamic';
  var DATA_RESOLVED = 'data-breadcrumb-resolved';
  var DATA_TYPE = 'data-breadcrumb-type';
  var DATA_IDENTIFIER = 'data-breadcrumb-identifier';
  var DATA_SEPARATOR = 'data-breadcrumb-separator';
  var DATA_SHOP_URL = 'data-breadcrumb-shop-url';
  var DATA_FALLBACK = 'data-breadcrumb-fallback';
  var DATA_PRODUCT_TITLE = 'data-breadcrumb-product-title';
  var DATA_PRODUCT_URL = 'data-breadcrumb-product-url';

  var BreadcrumbRenderer = {

    renderList: function (ol, items, separator, shopUrl) {
      if (!ol || !items || items.length === 0) return;

      var placeholder = ol.querySelector('[' + DATA_DYNAMIC + ']');
      if (!placeholder) return;

      shopUrl = shopUrl || window.location.origin;
      separator = separator || '/';

      var fragment = document.createDocumentFragment();

      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        fragment.appendChild(this._createSeparator(separator));
        fragment.appendChild(this._createItem(item, shopUrl));
      }

      placeholder.parentNode.replaceChild(fragment, placeholder);
    },

    renderFallback: function (ol, title, url, separator) {
      if (!ol || !title) return;

      var placeholder = ol.querySelector('[' + DATA_DYNAMIC + ']');
      if (!placeholder) return;

      separator = separator || '/';
      url = url || window.location.href;

      var fragment = document.createDocumentFragment();
      fragment.appendChild(this._createSeparator(separator));
      fragment.appendChild(this._createItem({
        name: title,
        url: url,
        isCurrent: true,
        isClickable: false,
        position: 2
      }, url));

      placeholder.parentNode.replaceChild(fragment, placeholder);
    },

    _createItem: function (item, shopUrl) {
      var li = document.createElement('li');
      li.className = 'breadcrumb__item';
      li.setAttribute('itemprop', 'itemListElement');
      li.setAttribute('itemscope', '');
      li.setAttribute('itemtype', SCHEMA_ITEM);

      if (item.isCurrent) {
        var span = document.createElement('span');
        span.setAttribute('itemprop', 'name');
        span.className = 'breadcrumb__current';
        span.setAttribute('aria-current', 'page');
        span.textContent = item.name;
        li.appendChild(span);

        if (item.url) {
          var link = document.createElement('link');
          link.setAttribute('itemprop', 'item');
          link.setAttribute('href', item.url);
          li.appendChild(link);
        }
      } else if (item.isClickable && item.url) {
        var a = document.createElement('a');
        a.setAttribute('href', this._fullUrl(item.url, shopUrl));
        a.setAttribute('itemprop', 'item');
        a.className = 'breadcrumb__link';

        var nameSpan = document.createElement('span');
        nameSpan.setAttribute('itemprop', 'name');
        nameSpan.textContent = item.name;

        a.appendChild(nameSpan);
        li.appendChild(a);
      } else {
        var textSpan = document.createElement('span');
        textSpan.setAttribute('itemprop', 'name');
        textSpan.textContent = item.name;
        li.appendChild(textSpan);
      }

      var meta = document.createElement('meta');
      meta.setAttribute('itemprop', 'position');
      meta.setAttribute('content', String(item.position));
      li.appendChild(meta);

      return li;
    },

    _createSeparator: function (text) {
      var li = document.createElement('li');
      li.className = 'breadcrumb__separator';
      li.setAttribute('aria-hidden', 'true');
      li.textContent = text;
      return li;
    },

    _fullUrl: function (url, shopUrl) {
      if (!url) return '';
      if (url.indexOf('http') === 0) return url;
      if (url.indexOf('//') === 0) return 'https:' + url;
      return shopUrl + (url.indexOf('/') === 0 ? url : '/' + url);
    },

    initAll: function () {
      var containers = document.querySelectorAll('[' + DATA_DYNAMIC + ']');
      if (containers.length === 0) return;

      var tree = this._ensureTree();
      if (!tree) return;

      for (var i = 0; i < containers.length; i++) {
        this._hydrateContainer(containers[i], tree);
      }
    },

    _ensureTree: function () {
      var sb = window.ShopifyBreadcrumb;
      if (sb._treeInstance) {
        return sb._treeInstance;
      }

      if (sb.Tree) {
        var treeData = document.getElementById('breadcrumb-tree-data');
        if (!treeData) return null;

        var rawTree;
        try {
          rawTree = JSON.parse(treeData.textContent);
        } catch (e) {
          return null;
        }

        var instance = sb.Tree.init(rawTree);
        sb._treeInstance = instance;
        return instance;
      }

      return null;
    },

    _readConfig: function (container) {
      var type = container.getAttribute(DATA_TYPE);
      var identifier = container.getAttribute(DATA_IDENTIFIER);
      if (!type || !identifier) return null;

      var config = {
        type: type,
        identifier: identifier,
        separator: container.getAttribute(DATA_SEPARATOR) || '/',
        shopUrl: container.getAttribute(DATA_SHOP_URL) || window.location.origin,
        fallbackTitle: container.getAttribute(DATA_FALLBACK) || ''
      };

      if (type === 'product') {
        config.productTitle = container.getAttribute(DATA_PRODUCT_TITLE) || '';
        config.productUrl = container.getAttribute(DATA_PRODUCT_URL) || '';
      }

      return config;
    },

    _resolveItems: function (config, tree) {
      var sb = window.ShopifyBreadcrumb;
      if (!sb.Resolver) return null;

      if (config.type === 'collection') {
        return sb.Resolver.resolveCollection(config.identifier, tree);
      }

      if (config.type === 'product') {
        return sb.Resolver.resolveProduct(config.identifier, tree, {
          title: config.productTitle,
          url: config.productUrl
        });
      }

      return null;
    },

    _hydrateContainer: function (container, tree) {
      if (container.getAttribute(DATA_RESOLVED) === 'true') return;

      var ol = container.closest('ol');
      if (!ol) return;

      var config = this._readConfig(container);
      if (!config) return;

      var items = this._resolveItems(config, tree);

      if (items && items.length > 0) {
        this.renderList(ol, items, config.separator, config.shopUrl);
      } else if (config.fallbackTitle) {
        this.renderFallback(ol, config.fallbackTitle, window.location.href, config.separator);
      }

      container.setAttribute(DATA_RESOLVED, 'true');
    }
  };

  window.ShopifyBreadcrumb.Breadcrumb = BreadcrumbRenderer;

  // Auto-init
  BreadcrumbRenderer.initAll();

  // Shopify section reload
  document.addEventListener('shopify:section:load', function (e) {
    if (e.target && e.target.querySelector('[' + DATA_DYNAMIC + ']')) {
      var containers = e.target.querySelectorAll('[' + DATA_DYNAMIC + ']');
      for (var i = 0; i < containers.length; i++) {
        containers[i].removeAttribute(DATA_RESOLVED);
      }
      BreadcrumbRenderer.initAll();
    }
  });
})();
