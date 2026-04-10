/**
 * Category Tree — Shared Index + Helpers
 *
 * Parsea el árbol de categorías UNA sola vez. Expone índices O(1)
 * y helpers para navegar la jerarquía (padres, hijos, hermanos, ruta).
 *
 * Usado por: Breadcrumb, Category Filter, y cualquier componente
 * que necesite consultar la estructura de categorías.
 *
 * Cargar PRIMERO en el HTML.
 *
 * API pública:
 *   ShopifyBreadcrumb.Tree.init(rawTree)              → instancia
 *   ShopifyBreadcrumb.Tree.lookupByUrl(url)            → { node, path, depth }
 *   ShopifyBreadcrumb.Tree.lookupByTag(tag)            → { node, path, depth }
 *   ShopifyBreadcrumb.Tree.lookupById(id)              → { node, path, depth }
 *   ShopifyBreadcrumb.Tree.getParents(node)            → Array<nodos padre>
 *   ShopifyBreadcrumb.Tree.getChildren(node)           → Array<nodos hijo>
 *   ShopifyBreadcrumb.Tree.getSiblings(node)           → Array<nodos hermano>
 *   ShopifyBreadcrumb.Tree.getRoots()                  → Array<nodos raíz>
 *   ShopifyBreadcrumb.Tree.getPathByUrl(url)           → Array<nodos del path>
 *   ShopifyBreadcrumb.Tree.getPathByTag(tag)           → Array<nodos del path>
 *   ShopifyBreadcrumb.Tree.getStats()                  → { byUrl, byTag, ... }
 */
(function () {
  'use strict';

  window.ShopifyBreadcrumb = window.ShopifyBreadcrumb || {};

  var CategoryTreeIndex = {
    indices: null,
    tree: null,

    /* ============================================
       Inicialización
       ============================================ */

    init: function (rawTree) {
      if (window.ShopifyBreadcrumb._treeInstance) {
        return window.ShopifyBreadcrumb._treeInstance;
      }

      if (rawTree === undefined || rawTree === null) {
        this.tree = [];
        this.indices = { byUrl: new Map(), byTag: new Map(), byId: new Map(), byHandle: new Map(), byName: new Map() };
        window.ShopifyBreadcrumb._treeIndex = this.indices;
        window.ShopifyBreadcrumb._treeInstance = this;
        return this;
      }

      this.tree = this._normalizeTree(rawTree);

      this.indices = {
        byUrl: new Map(),
        byTag: new Map(),
        byId: new Map(),
        byHandle: new Map(),
        byName: new Map()
      };

      this._buildIndices(this.tree, [], 0);

      window.ShopifyBreadcrumb._treeIndex = this.indices;
      window.ShopifyBreadcrumb._treeInstance = this;

      return this;
    },

    get: function () {
      return window.ShopifyBreadcrumb._treeIndex || null;
    },

    /* ============================================
       Normalización
       ============================================ */

    _normalizeTree: function (rawTree) {
      if (!rawTree) return [];
      if (Array.isArray(rawTree) && rawTree[0] && rawTree[0].records) {
        return rawTree[0].records;
      }
      if (rawTree.records && Array.isArray(rawTree.records)) {
        return rawTree.records;
      }
      if (Array.isArray(rawTree)) {
        return rawTree;
      }
      return [];
    },

    /* ============================================
       Construcción de índices (iterativo, sin recursión)
       ============================================ */

    _buildIndices: function (nodes, ancestors, depth) {
      var stack = [{ nodes: nodes, ancestors: ancestors, depth: depth, index: 0 }];

      while (stack.length > 0) {
        var frame = stack[stack.length - 1];
        var currentNodes = frame.nodes;
        var i = frame.index;

        if (i >= currentNodes.length) {
          stack.pop();
          continue;
        }

        frame.index = i + 1;

        var node = currentNodes[i];
        if (!node || typeof node !== 'object') continue;

        var path = frame.ancestors.concat([node]);

        if (node.id) {
          this.indices.byId.set(node.id, { node: node, path: path, depth: frame.depth });
        }

        if (node.tag) {
          this.indices.byTag.set(node.tag, { node: node, path: path, depth: frame.depth });
        }

        if (node.name) {
          var normalizedName = node.name.toLowerCase().replace(/[_\s]+/g, '');
          this.indices.byName.set(normalizedName, { node: node, path: path, depth: frame.depth });
          this.indices.byName.set(node.name.toLowerCase().replace(/\s+/g, '_'), { node: node, path: path, depth: frame.depth });
        }

        if (node.url) {
          var normalizedUrl = this._normalizeUrl(node.url);
          this.indices.byUrl.set(normalizedUrl, { node: node, path: path, depth: frame.depth });

          var handle = this._extractHandle(node.url);
          if (handle) {
            this.indices.byHandle.set(handle, { node: node, path: path, depth: frame.depth });
          }
        }

        if (node.child && node.child.length > 0) {
          stack.push({ nodes: node.child, ancestors: path, depth: frame.depth + 1, index: 0 });
        }
      }
    },

    /* ============================================
       Utilidades internas
       ============================================ */

    _normalizeUrl: function (url) {
      if (!url) return '';
      return url.toLowerCase().replace(/\/+$/, '').replace(/^\/+/, '');
    },

    _extractHandle: function (url) {
      if (!url) return '';
      var parts = url.split('/').filter(function (p) { return p; });
      var idx = parts.indexOf('collections');
      if (idx !== -1 && parts[idx + 1]) {
        return parts[idx + 1].toLowerCase();
      }
      return parts[parts.length - 1] ? parts[parts.length - 1].toLowerCase() : '';
    },

    /* ============================================
       Lookups O(1)
       ============================================ */

    lookupByUrl: function (url) {
      if (!url || !this.indices) return null;

      var normalized = this._normalizeUrl(url);
      if (this.indices.byUrl.has(normalized)) {
        return this.indices.byUrl.get(normalized);
      }

      var handle = this._extractHandle(url);
      if (handle && this.indices.byHandle.has(handle)) {
        return this.indices.byHandle.get(handle);
      }

      if (this.indices.byHandle.has(url.toLowerCase())) {
        return this.indices.byHandle.get(url.toLowerCase());
      }

      return null;
    },

    lookupByTag: function (tagPath) {
      if (!tagPath || !this.indices) return null;
      return this.indices.byTag.get(tagPath) || null;
    },

    lookupById: function (id) {
      if (!id || !this.indices) return null;
      return this.indices.byId.get(id) || null;
    },

    /* ============================================
       Helpers de navegación (padres, hijos, hermanos)
       ============================================ */

    /**
     * Retorna los nodos padre de un nodo dado.
     * @param {Object} node - Nodo del árbol
     * @returns {Array} Nodos padre (excluye el nodo mismo)
     */
    getParents: function (node) {
      if (!node) return [];
      var entry = this.indices.byId.get(node.id) ||
                  this.indices.byTag.get(node.tag) ||
                  this.indices.byUrl.get(this._normalizeUrl(node.url));
      if (!entry || !entry.path) return [];
      return entry.path.slice(0, -1);
    },

    /**
     * Retorna los nodos hijo directos de un nodo.
     * @param {Object} node - Nodo del árbol
     * @returns {Array} Nodos hijo directos
     */
    getChildren: function (node) {
      if (!node || !node.child) return [];
      return node.child;
    },

    /**
     * Retorna los nodos hermano de un nodo dado.
     * @param {Object} node - Nodo del árbol
     * @returns {Array} Nodos hermano (excluye el nodo mismo)
     */
    getSiblings: function (node) {
      if (!node) return [];
      var parents = this.getParents(node);
      if (parents.length === 0) {
        // Nodo raíz: hermanos son otros nodos raíz
        return this.tree.filter(function (n) { return n !== node; });
      }
      var parent = parents[parents.length - 1];
      return (parent.child || []).filter(function (n) { return n !== node; });
    },

    /**
     * Retorna todos los nodos raíz del árbol.
     * @returns {Array} Nodos raíz
     */
    getRoots: function () {
      return this.tree || [];
    },

    /**
     * Retorna el path completo de nodos desde la raíz hasta un nodo por URL.
     * @param {string} url - URL del nodo
     * @returns {Array} Nodos del path (incluye el nodo)
     */
    getPathByUrl: function (url) {
      var entry = this.lookupByUrl(url);
      return entry && entry.path ? entry.path : [];
    },

    /**
     * Retorna el path completo de nodos desde la raíz hasta un nodo por tag.
     * @param {string} tagPath - Tag del nodo
     * @returns {Array} Nodos del path (incluye el nodo)
     */
    getPathByTag: function (tagPath) {
      var entry = this.lookupByTag(tagPath);
      return entry && entry.path ? entry.path : [];
    },

    /**
     * Retorna todos los descendientes de un nodo (recursivo).
     * @param {Object} node - Nodo del árbol
     * @returns {Array} Todos los nodos descendientes
     */
    getDescendants: function (node) {
      var result = [];
      if (!node || !node.child) return result;

      var stack = node.child.slice();
      while (stack.length > 0) {
        var current = stack.pop();
        result.push(current);
        if (current.child) {
          stack = stack.concat(current.child);
        }
      }
      return result;
    },

    /* ============================================
       Debugging
       ============================================ */

    getStats: function () {
      if (!this.indices) return { initialized: false };
      return {
        initialized: true,
        totalRootNodes: this.tree ? this.tree.length : 0,
        byUrl: this.indices.byUrl.size,
        byTag: this.indices.byTag.size,
        byId: this.indices.byId.size,
        byHandle: this.indices.byHandle.size,
        byName: this.indices.byName.size
      };
    },

    reset: function () {
      this.indices = null;
      this.tree = null;
      window.ShopifyBreadcrumb._treeIndex = null;
      window.ShopifyBreadcrumb._treeInstance = null;
    }
  };

  window.ShopifyBreadcrumb.Tree = CategoryTreeIndex;
})();
