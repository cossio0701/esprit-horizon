/**
 * Category Filter — UI Component
 *
 * Depende de: category-tree.js (ShopifyBreadcrumb.Tree)
 * Cargar DESPUÉS de category-tree.js.
 *
 * Renderiza un filtro de categorías expandible basado en el árbol.
 * Permite navegar por padres, hijos y hermanos para filtrar productos.
 *
 * Uso:
 *   <div data-category-filter
 *        data-filter-root="/collections/ropa-mujer"
 *        data-filter-active="camisas">
 *   </div>
 *
 *   ShopifyBreadcrumb.Filter.initAll()  → auto-init
 *   ShopifyBreadcrumb.Filter.init(el)   → init individual
 */
(function () {
  'use strict';

  window.ShopifyBreadcrumb = window.ShopifyBreadcrumb || {};

  var DATA_FILTER = 'data-category-filter';
  var DATA_FILTER_ROOT = 'data-filter-root';
  var DATA_FILTER_ACTIVE = 'data-filter-active';
  var DATA_FILTER_LEVEL = 'data-filter-level';

  var CategoryFilter = {

    initAll: function () {
      var containers = document.querySelectorAll('[' + DATA_FILTER + ']');
      for (var i = 0; i < containers.length; i++) {
        this.init(containers[i]);
      }
    },

    init: function (container) {
      if (container.getAttribute('data-filter-initialized') === 'true') return;

      var tree = this._ensureTree();
      if (!tree) return;

      var rootUrl = container.getAttribute(DATA_FILTER_ROOT) || '';
      var activeTag = container.getAttribute(DATA_FILTER_ACTIVE) || '';

      var rootNode = rootUrl ? tree.lookupByUrl(rootUrl) : null;
      var nodes = rootNode ? tree.getChildren(rootNode.node) : tree.getRoots();

      if (nodes.length === 0) return;

      var html = this._renderLevel(nodes, tree, activeTag, 0);
      container.innerHTML = html;
      container.setAttribute('data-filter-initialized', 'true');

      this._bindEvents(container, tree);
    },

    _ensureTree: function () {
      var sb = window.ShopifyBreadcrumb;
      if (sb._treeInstance) return sb._treeInstance;
      if (sb.Tree) {
        var treeData = document.getElementById('breadcrumb-tree-data');
        if (!treeData) return null;
        try {
          return sb.Tree.init(JSON.parse(treeData.textContent));
        } catch (e) {
          return null;
        }
      }
      return null;
    },

    _isActive: function (node, activeTag) {
      if (!activeTag || !node) return false;

      // Exact tag match
      if (node.tag === activeTag) return true;

      // Exact handle match from URL
      if (node.url) {
        var parts = node.url.split('/').filter(function (p) { return p; });
        var lastPart = parts[parts.length - 1];
        if (lastPart === activeTag) return true;
      }

      return false;
    },

    _renderLevel: function (nodes, tree, activeTag, depth) {
      if (!nodes || nodes.length === 0) return '';

      var html = '<ul class="category-filter__list" ' + DATA_FILTER_LEVEL + '="' + depth + '">';

      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        var hasChildren = node.child && node.child.length > 0;
        var isActive = this._isActive(node, activeTag);

        html += '<li class="category-filter__item' + (isActive ? ' category-filter__item--active' : '') + '">';

        if (node.url) {
          html += '<a href="' + this._escapeAttr(node.url) + '" class="category-filter__link"';
          if (isActive) html += ' aria-current="page"';
          html += '>' + this._escapeHtml(node.name) + '</a>';
        } else {
          html += '<span class="category-filter__label">' + this._escapeHtml(node.name) + '</span>';
        }

        if (hasChildren) {
          html += '<button type="button" class="category-filter__toggle" aria-expanded="false" aria-label="Expandir ' + this._escapeAttr(node.name) + '">';
          html += '<span class="category-filter__toggle-icon"></span>';
          html += '</button>';

          html += '<div class="category-filter__children" hidden>';
          html += this._renderLevel(node.child, tree, activeTag, depth + 1);
          html += '</div>';
        }

        html += '</li>';
      }

      html += '</ul>';
      return html;
    },

    _bindEvents: function (container) {
      container.addEventListener('click', function (e) {
        var toggle = e.target.closest('.category-filter__toggle');
        if (!toggle) return;

        e.preventDefault();
        var parent = toggle.closest('.category-filter__item');
        var children = parent.querySelector('.category-filter__children');
        if (!children) return;

        var isExpanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', String(!isExpanded));
        children.hidden = isExpanded;
      });
    },

    _escapeHtml: function (text) {
      if (!text) return '';
      var div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    },

    _escapeAttr: function (text) {
      if (!text) return '';
      return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  };

  window.ShopifyBreadcrumb.Filter = CategoryFilter;

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      CategoryFilter.initAll();
    });
  } else {
    CategoryFilter.initAll();
  }

  document.addEventListener('shopify:section:load', function (e) {
    if (e.target && e.target.querySelector('[' + DATA_FILTER + ']')) {
      CategoryFilter.initAll();
    }
  });
})();
