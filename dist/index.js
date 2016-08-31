(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (global){
var topLevel = typeof global !== 'undefined' ? global :
    typeof window !== 'undefined' ? window : {}
var minDoc = require('min-document');

if (typeof document !== 'undefined') {
    module.exports = document;
} else {
    var doccy = topLevel['__GLOBAL_DOCUMENT_CACHE@4'];

    if (!doccy) {
        doccy = topLevel['__GLOBAL_DOCUMENT_CACHE@4'] = minDoc;
    }

    module.exports = doccy;
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"min-document":27}],2:[function(require,module,exports){
"use strict";

module.exports = function isObject(x) {
	return typeof x === "object" && x !== null;
};

},{}],3:[function(require,module,exports){
var createElement = require("./vdom/create-element.js")

module.exports = createElement

},{"./vdom/create-element.js":7}],4:[function(require,module,exports){
var diff = require("./vtree/diff.js")

module.exports = diff

},{"./vtree/diff.js":24}],5:[function(require,module,exports){
var patch = require("./vdom/patch.js")

module.exports = patch

},{"./vdom/patch.js":10}],6:[function(require,module,exports){
var isObject = require("is-object")
var isHook = require("../vnode/is-vhook.js")

module.exports = applyProperties

function applyProperties(node, props, previous) {
    for (var propName in props) {
        var propValue = props[propName]

        if (propValue === undefined) {
            removeProperty(node, propName, propValue, previous);
        } else if (isHook(propValue)) {
            removeProperty(node, propName, propValue, previous)
            if (propValue.hook) {
                propValue.hook(node,
                    propName,
                    previous ? previous[propName] : undefined)
            }
        } else {
            if (isObject(propValue)) {
                patchObject(node, props, previous, propName, propValue);
            } else {
                node[propName] = propValue
            }
        }
    }
}

function removeProperty(node, propName, propValue, previous) {
    if (previous) {
        var previousValue = previous[propName]

        if (!isHook(previousValue)) {
            if (propName === "attributes") {
                for (var attrName in previousValue) {
                    node.removeAttribute(attrName)
                }
            } else if (propName === "style") {
                for (var i in previousValue) {
                    node.style[i] = ""
                }
            } else if (typeof previousValue === "string") {
                node[propName] = ""
            } else {
                node[propName] = null
            }
        } else if (previousValue.unhook) {
            previousValue.unhook(node, propName, propValue)
        }
    }
}

function patchObject(node, props, previous, propName, propValue) {
    var previousValue = previous ? previous[propName] : undefined

    // Set attributes
    if (propName === "attributes") {
        for (var attrName in propValue) {
            var attrValue = propValue[attrName]

            if (attrValue === undefined) {
                node.removeAttribute(attrName)
            } else {
                node.setAttribute(attrName, attrValue)
            }
        }

        return
    }

    if(previousValue && isObject(previousValue) &&
        getPrototype(previousValue) !== getPrototype(propValue)) {
        node[propName] = propValue
        return
    }

    if (!isObject(node[propName])) {
        node[propName] = {}
    }

    var replacer = propName === "style" ? "" : undefined

    for (var k in propValue) {
        var value = propValue[k]
        node[propName][k] = (value === undefined) ? replacer : value
    }
}

function getPrototype(value) {
    if (Object.getPrototypeOf) {
        return Object.getPrototypeOf(value)
    } else if (value.__proto__) {
        return value.__proto__
    } else if (value.constructor) {
        return value.constructor.prototype
    }
}

},{"../vnode/is-vhook.js":15,"is-object":2}],7:[function(require,module,exports){
var document = require("global/document")

var applyProperties = require("./apply-properties")

var isVNode = require("../vnode/is-vnode.js")
var isVText = require("../vnode/is-vtext.js")
var isWidget = require("../vnode/is-widget.js")
var handleThunk = require("../vnode/handle-thunk.js")

module.exports = createElement

function createElement(vnode, opts) {
    var doc = opts ? opts.document || document : document
    var warn = opts ? opts.warn : null

    vnode = handleThunk(vnode).a

    if (isWidget(vnode)) {
        return vnode.init()
    } else if (isVText(vnode)) {
        return doc.createTextNode(vnode.text)
    } else if (!isVNode(vnode)) {
        if (warn) {
            warn("Item is not a valid virtual dom node", vnode)
        }
        return null
    }

    var node = (vnode.namespace === null) ?
        doc.createElement(vnode.tagName) :
        doc.createElementNS(vnode.namespace, vnode.tagName)

    var props = vnode.properties
    applyProperties(node, props)

    var children = vnode.children

    for (var i = 0; i < children.length; i++) {
        var childNode = createElement(children[i], opts)
        if (childNode) {
            node.appendChild(childNode)
        }
    }

    return node
}

},{"../vnode/handle-thunk.js":13,"../vnode/is-vnode.js":16,"../vnode/is-vtext.js":17,"../vnode/is-widget.js":18,"./apply-properties":6,"global/document":1}],8:[function(require,module,exports){
// Maps a virtual DOM tree onto a real DOM tree in an efficient manner.
// We don't want to read all of the DOM nodes in the tree so we use
// the in-order tree indexing to eliminate recursion down certain branches.
// We only recurse into a DOM node if we know that it contains a child of
// interest.

var noChild = {}

module.exports = domIndex

function domIndex(rootNode, tree, indices, nodes) {
    if (!indices || indices.length === 0) {
        return {}
    } else {
        indices.sort(ascending)
        return recurse(rootNode, tree, indices, nodes, 0)
    }
}

function recurse(rootNode, tree, indices, nodes, rootIndex) {
    nodes = nodes || {}


    if (rootNode) {
        if (indexInRange(indices, rootIndex, rootIndex)) {
            nodes[rootIndex] = rootNode
        }

        var vChildren = tree.children

        if (vChildren) {

            var childNodes = rootNode.childNodes

            for (var i = 0; i < tree.children.length; i++) {
                rootIndex += 1

                var vChild = vChildren[i] || noChild
                var nextIndex = rootIndex + (vChild.count || 0)

                // skip recursion down the tree if there are no nodes down here
                if (indexInRange(indices, rootIndex, nextIndex)) {
                    recurse(childNodes[i], vChild, indices, nodes, rootIndex)
                }

                rootIndex = nextIndex
            }
        }
    }

    return nodes
}

// Binary search for an index in the interval [left, right]
function indexInRange(indices, left, right) {
    if (indices.length === 0) {
        return false
    }

    var minIndex = 0
    var maxIndex = indices.length - 1
    var currentIndex
    var currentItem

    while (minIndex <= maxIndex) {
        currentIndex = ((maxIndex + minIndex) / 2) >> 0
        currentItem = indices[currentIndex]

        if (minIndex === maxIndex) {
            return currentItem >= left && currentItem <= right
        } else if (currentItem < left) {
            minIndex = currentIndex + 1
        } else  if (currentItem > right) {
            maxIndex = currentIndex - 1
        } else {
            return true
        }
    }

    return false;
}

function ascending(a, b) {
    return a > b ? 1 : -1
}

},{}],9:[function(require,module,exports){
var applyProperties = require("./apply-properties")

var isWidget = require("../vnode/is-widget.js")
var VPatch = require("../vnode/vpatch.js")

var updateWidget = require("./update-widget")

module.exports = applyPatch

function applyPatch(vpatch, domNode, renderOptions) {
    var type = vpatch.type
    var vNode = vpatch.vNode
    var patch = vpatch.patch

    switch (type) {
        case VPatch.REMOVE:
            return removeNode(domNode, vNode)
        case VPatch.INSERT:
            return insertNode(domNode, patch, renderOptions)
        case VPatch.VTEXT:
            return stringPatch(domNode, vNode, patch, renderOptions)
        case VPatch.WIDGET:
            return widgetPatch(domNode, vNode, patch, renderOptions)
        case VPatch.VNODE:
            return vNodePatch(domNode, vNode, patch, renderOptions)
        case VPatch.ORDER:
            reorderChildren(domNode, patch)
            return domNode
        case VPatch.PROPS:
            applyProperties(domNode, patch, vNode.properties)
            return domNode
        case VPatch.THUNK:
            return replaceRoot(domNode,
                renderOptions.patch(domNode, patch, renderOptions))
        default:
            return domNode
    }
}

function removeNode(domNode, vNode) {
    var parentNode = domNode.parentNode

    if (parentNode) {
        parentNode.removeChild(domNode)
    }

    destroyWidget(domNode, vNode);

    return null
}

function insertNode(parentNode, vNode, renderOptions) {
    var newNode = renderOptions.render(vNode, renderOptions)

    if (parentNode) {
        parentNode.appendChild(newNode)
    }

    return parentNode
}

function stringPatch(domNode, leftVNode, vText, renderOptions) {
    var newNode

    if (domNode.nodeType === 3) {
        domNode.replaceData(0, domNode.length, vText.text)
        newNode = domNode
    } else {
        var parentNode = domNode.parentNode
        newNode = renderOptions.render(vText, renderOptions)

        if (parentNode && newNode !== domNode) {
            parentNode.replaceChild(newNode, domNode)
        }
    }

    return newNode
}

function widgetPatch(domNode, leftVNode, widget, renderOptions) {
    var updating = updateWidget(leftVNode, widget)
    var newNode

    if (updating) {
        newNode = widget.update(leftVNode, domNode) || domNode
    } else {
        newNode = renderOptions.render(widget, renderOptions)
    }

    var parentNode = domNode.parentNode

    if (parentNode && newNode !== domNode) {
        parentNode.replaceChild(newNode, domNode)
    }

    if (!updating) {
        destroyWidget(domNode, leftVNode)
    }

    return newNode
}

function vNodePatch(domNode, leftVNode, vNode, renderOptions) {
    var parentNode = domNode.parentNode
    var newNode = renderOptions.render(vNode, renderOptions)

    if (parentNode && newNode !== domNode) {
        parentNode.replaceChild(newNode, domNode)
    }

    return newNode
}

function destroyWidget(domNode, w) {
    if (typeof w.destroy === "function" && isWidget(w)) {
        w.destroy(domNode)
    }
}

function reorderChildren(domNode, moves) {
    var childNodes = domNode.childNodes
    var keyMap = {}
    var node
    var remove
    var insert

    for (var i = 0; i < moves.removes.length; i++) {
        remove = moves.removes[i]
        node = childNodes[remove.from]
        if (remove.key) {
            keyMap[remove.key] = node
        }
        domNode.removeChild(node)
    }

    var length = childNodes.length
    for (var j = 0; j < moves.inserts.length; j++) {
        insert = moves.inserts[j]
        node = keyMap[insert.key]
        // this is the weirdest bug i've ever seen in webkit
        domNode.insertBefore(node, insert.to >= length++ ? null : childNodes[insert.to])
    }
}

function replaceRoot(oldRoot, newRoot) {
    if (oldRoot && newRoot && oldRoot !== newRoot && oldRoot.parentNode) {
        oldRoot.parentNode.replaceChild(newRoot, oldRoot)
    }

    return newRoot;
}

},{"../vnode/is-widget.js":18,"../vnode/vpatch.js":21,"./apply-properties":6,"./update-widget":11}],10:[function(require,module,exports){
var document = require("global/document")
var isArray = require("x-is-array")

var render = require("./create-element")
var domIndex = require("./dom-index")
var patchOp = require("./patch-op")
module.exports = patch

function patch(rootNode, patches, renderOptions) {
    renderOptions = renderOptions || {}
    renderOptions.patch = renderOptions.patch && renderOptions.patch !== patch
        ? renderOptions.patch
        : patchRecursive
    renderOptions.render = renderOptions.render || render

    return renderOptions.patch(rootNode, patches, renderOptions)
}

function patchRecursive(rootNode, patches, renderOptions) {
    var indices = patchIndices(patches)

    if (indices.length === 0) {
        return rootNode
    }

    var index = domIndex(rootNode, patches.a, indices)
    var ownerDocument = rootNode.ownerDocument

    if (!renderOptions.document && ownerDocument !== document) {
        renderOptions.document = ownerDocument
    }

    for (var i = 0; i < indices.length; i++) {
        var nodeIndex = indices[i]
        rootNode = applyPatch(rootNode,
            index[nodeIndex],
            patches[nodeIndex],
            renderOptions)
    }

    return rootNode
}

function applyPatch(rootNode, domNode, patchList, renderOptions) {
    if (!domNode) {
        return rootNode
    }

    var newNode

    if (isArray(patchList)) {
        for (var i = 0; i < patchList.length; i++) {
            newNode = patchOp(patchList[i], domNode, renderOptions)

            if (domNode === rootNode) {
                rootNode = newNode
            }
        }
    } else {
        newNode = patchOp(patchList, domNode, renderOptions)

        if (domNode === rootNode) {
            rootNode = newNode
        }
    }

    return rootNode
}

function patchIndices(patches) {
    var indices = []

    for (var key in patches) {
        if (key !== "a") {
            indices.push(Number(key))
        }
    }

    return indices
}

},{"./create-element":7,"./dom-index":8,"./patch-op":9,"global/document":1,"x-is-array":25}],11:[function(require,module,exports){
var isWidget = require("../vnode/is-widget.js")

module.exports = updateWidget

function updateWidget(a, b) {
    if (isWidget(a) && isWidget(b)) {
        if ("name" in a && "name" in b) {
            return a.id === b.id
        } else {
            return a.init === b.init
        }
    }

    return false
}

},{"../vnode/is-widget.js":18}],12:[function(require,module,exports){
'use strict';

module.exports = SoftSetHook;

function SoftSetHook(value) {
    if (!(this instanceof SoftSetHook)) {
        return new SoftSetHook(value);
    }

    this.value = value;
}

SoftSetHook.prototype.hook = function (node, propertyName) {
    if (node[propertyName] !== this.value) {
        node[propertyName] = this.value;
    }
};

},{}],13:[function(require,module,exports){
var isVNode = require("./is-vnode")
var isVText = require("./is-vtext")
var isWidget = require("./is-widget")
var isThunk = require("./is-thunk")

module.exports = handleThunk

function handleThunk(a, b) {
    var renderedA = a
    var renderedB = b

    if (isThunk(b)) {
        renderedB = renderThunk(b, a)
    }

    if (isThunk(a)) {
        renderedA = renderThunk(a, null)
    }

    return {
        a: renderedA,
        b: renderedB
    }
}

function renderThunk(thunk, previous) {
    var renderedThunk = thunk.vnode

    if (!renderedThunk) {
        renderedThunk = thunk.vnode = thunk.render(previous)
    }

    if (!(isVNode(renderedThunk) ||
            isVText(renderedThunk) ||
            isWidget(renderedThunk))) {
        throw new Error("thunk did not return a valid node");
    }

    return renderedThunk
}

},{"./is-thunk":14,"./is-vnode":16,"./is-vtext":17,"./is-widget":18}],14:[function(require,module,exports){
module.exports = isThunk

function isThunk(t) {
    return t && t.type === "Thunk"
}

},{}],15:[function(require,module,exports){
module.exports = isHook

function isHook(hook) {
    return hook &&
      (typeof hook.hook === "function" && !hook.hasOwnProperty("hook") ||
       typeof hook.unhook === "function" && !hook.hasOwnProperty("unhook"))
}

},{}],16:[function(require,module,exports){
var version = require("./version")

module.exports = isVirtualNode

function isVirtualNode(x) {
    return x && x.type === "VirtualNode" && x.version === version
}

},{"./version":19}],17:[function(require,module,exports){
var version = require("./version")

module.exports = isVirtualText

function isVirtualText(x) {
    return x && x.type === "VirtualText" && x.version === version
}

},{"./version":19}],18:[function(require,module,exports){
module.exports = isWidget

function isWidget(w) {
    return w && w.type === "Widget"
}

},{}],19:[function(require,module,exports){
module.exports = "2"

},{}],20:[function(require,module,exports){
var version = require("./version")
var isVNode = require("./is-vnode")
var isWidget = require("./is-widget")
var isThunk = require("./is-thunk")
var isVHook = require("./is-vhook")

module.exports = VirtualNode

var noProperties = {}
var noChildren = []

function VirtualNode(tagName, properties, children, key, namespace) {
    this.tagName = tagName
    this.properties = properties || noProperties
    this.children = children || noChildren
    this.key = key != null ? String(key) : undefined
    this.namespace = (typeof namespace === "string") ? namespace : null

    var count = (children && children.length) || 0
    var descendants = 0
    var hasWidgets = false
    var hasThunks = false
    var descendantHooks = false
    var hooks

    for (var propName in properties) {
        if (properties.hasOwnProperty(propName)) {
            var property = properties[propName]
            if (isVHook(property) && property.unhook) {
                if (!hooks) {
                    hooks = {}
                }

                hooks[propName] = property
            }
        }
    }

    for (var i = 0; i < count; i++) {
        var child = children[i]
        if (isVNode(child)) {
            descendants += child.count || 0

            if (!hasWidgets && child.hasWidgets) {
                hasWidgets = true
            }

            if (!hasThunks && child.hasThunks) {
                hasThunks = true
            }

            if (!descendantHooks && (child.hooks || child.descendantHooks)) {
                descendantHooks = true
            }
        } else if (!hasWidgets && isWidget(child)) {
            if (typeof child.destroy === "function") {
                hasWidgets = true
            }
        } else if (!hasThunks && isThunk(child)) {
            hasThunks = true;
        }
    }

    this.count = count + descendants
    this.hasWidgets = hasWidgets
    this.hasThunks = hasThunks
    this.hooks = hooks
    this.descendantHooks = descendantHooks
}

VirtualNode.prototype.version = version
VirtualNode.prototype.type = "VirtualNode"

},{"./is-thunk":14,"./is-vhook":15,"./is-vnode":16,"./is-widget":18,"./version":19}],21:[function(require,module,exports){
var version = require("./version")

VirtualPatch.NONE = 0
VirtualPatch.VTEXT = 1
VirtualPatch.VNODE = 2
VirtualPatch.WIDGET = 3
VirtualPatch.PROPS = 4
VirtualPatch.ORDER = 5
VirtualPatch.INSERT = 6
VirtualPatch.REMOVE = 7
VirtualPatch.THUNK = 8

module.exports = VirtualPatch

function VirtualPatch(type, vNode, patch) {
    this.type = Number(type)
    this.vNode = vNode
    this.patch = patch
}

VirtualPatch.prototype.version = version
VirtualPatch.prototype.type = "VirtualPatch"

},{"./version":19}],22:[function(require,module,exports){
var version = require("./version")

module.exports = VirtualText

function VirtualText(text) {
    this.text = String(text)
}

VirtualText.prototype.version = version
VirtualText.prototype.type = "VirtualText"

},{"./version":19}],23:[function(require,module,exports){
var isObject = require("is-object")
var isHook = require("../vnode/is-vhook")

module.exports = diffProps

function diffProps(a, b) {
    var diff

    for (var aKey in a) {
        if (!(aKey in b)) {
            diff = diff || {}
            diff[aKey] = undefined
        }

        var aValue = a[aKey]
        var bValue = b[aKey]

        if (aValue === bValue) {
            continue
        } else if (isObject(aValue) && isObject(bValue)) {
            if (getPrototype(bValue) !== getPrototype(aValue)) {
                diff = diff || {}
                diff[aKey] = bValue
            } else if (isHook(bValue)) {
                 diff = diff || {}
                 diff[aKey] = bValue
            } else {
                var objectDiff = diffProps(aValue, bValue)
                if (objectDiff) {
                    diff = diff || {}
                    diff[aKey] = objectDiff
                }
            }
        } else {
            diff = diff || {}
            diff[aKey] = bValue
        }
    }

    for (var bKey in b) {
        if (!(bKey in a)) {
            diff = diff || {}
            diff[bKey] = b[bKey]
        }
    }

    return diff
}

function getPrototype(value) {
  if (Object.getPrototypeOf) {
    return Object.getPrototypeOf(value)
  } else if (value.__proto__) {
    return value.__proto__
  } else if (value.constructor) {
    return value.constructor.prototype
  }
}

},{"../vnode/is-vhook":15,"is-object":2}],24:[function(require,module,exports){
var isArray = require("x-is-array")

var VPatch = require("../vnode/vpatch")
var isVNode = require("../vnode/is-vnode")
var isVText = require("../vnode/is-vtext")
var isWidget = require("../vnode/is-widget")
var isThunk = require("../vnode/is-thunk")
var handleThunk = require("../vnode/handle-thunk")

var diffProps = require("./diff-props")

module.exports = diff

function diff(a, b) {
    var patch = { a: a }
    walk(a, b, patch, 0)
    return patch
}

function walk(a, b, patch, index) {
    if (a === b) {
        return
    }

    var apply = patch[index]
    var applyClear = false

    if (isThunk(a) || isThunk(b)) {
        thunks(a, b, patch, index)
    } else if (b == null) {

        // If a is a widget we will add a remove patch for it
        // Otherwise any child widgets/hooks must be destroyed.
        // This prevents adding two remove patches for a widget.
        if (!isWidget(a)) {
            clearState(a, patch, index)
            apply = patch[index]
        }

        apply = appendPatch(apply, new VPatch(VPatch.REMOVE, a, b))
    } else if (isVNode(b)) {
        if (isVNode(a)) {
            if (a.tagName === b.tagName &&
                a.namespace === b.namespace &&
                a.key === b.key) {
                var propsPatch = diffProps(a.properties, b.properties)
                if (propsPatch) {
                    apply = appendPatch(apply,
                        new VPatch(VPatch.PROPS, a, propsPatch))
                }
                apply = diffChildren(a, b, patch, apply, index)
            } else {
                apply = appendPatch(apply, new VPatch(VPatch.VNODE, a, b))
                applyClear = true
            }
        } else {
            apply = appendPatch(apply, new VPatch(VPatch.VNODE, a, b))
            applyClear = true
        }
    } else if (isVText(b)) {
        if (!isVText(a)) {
            apply = appendPatch(apply, new VPatch(VPatch.VTEXT, a, b))
            applyClear = true
        } else if (a.text !== b.text) {
            apply = appendPatch(apply, new VPatch(VPatch.VTEXT, a, b))
        }
    } else if (isWidget(b)) {
        if (!isWidget(a)) {
            applyClear = true
        }

        apply = appendPatch(apply, new VPatch(VPatch.WIDGET, a, b))
    }

    if (apply) {
        patch[index] = apply
    }

    if (applyClear) {
        clearState(a, patch, index)
    }
}

function diffChildren(a, b, patch, apply, index) {
    var aChildren = a.children
    var orderedSet = reorder(aChildren, b.children)
    var bChildren = orderedSet.children

    var aLen = aChildren.length
    var bLen = bChildren.length
    var len = aLen > bLen ? aLen : bLen

    for (var i = 0; i < len; i++) {
        var leftNode = aChildren[i]
        var rightNode = bChildren[i]
        index += 1

        if (!leftNode) {
            if (rightNode) {
                // Excess nodes in b need to be added
                apply = appendPatch(apply,
                    new VPatch(VPatch.INSERT, null, rightNode))
            }
        } else {
            walk(leftNode, rightNode, patch, index)
        }

        if (isVNode(leftNode) && leftNode.count) {
            index += leftNode.count
        }
    }

    if (orderedSet.moves) {
        // Reorder nodes last
        apply = appendPatch(apply, new VPatch(
            VPatch.ORDER,
            a,
            orderedSet.moves
        ))
    }

    return apply
}

function clearState(vNode, patch, index) {
    // TODO: Make this a single walk, not two
    unhook(vNode, patch, index)
    destroyWidgets(vNode, patch, index)
}

// Patch records for all destroyed widgets must be added because we need
// a DOM node reference for the destroy function
function destroyWidgets(vNode, patch, index) {
    if (isWidget(vNode)) {
        if (typeof vNode.destroy === "function") {
            patch[index] = appendPatch(
                patch[index],
                new VPatch(VPatch.REMOVE, vNode, null)
            )
        }
    } else if (isVNode(vNode) && (vNode.hasWidgets || vNode.hasThunks)) {
        var children = vNode.children
        var len = children.length
        for (var i = 0; i < len; i++) {
            var child = children[i]
            index += 1

            destroyWidgets(child, patch, index)

            if (isVNode(child) && child.count) {
                index += child.count
            }
        }
    } else if (isThunk(vNode)) {
        thunks(vNode, null, patch, index)
    }
}

// Create a sub-patch for thunks
function thunks(a, b, patch, index) {
    var nodes = handleThunk(a, b)
    var thunkPatch = diff(nodes.a, nodes.b)
    if (hasPatches(thunkPatch)) {
        patch[index] = new VPatch(VPatch.THUNK, null, thunkPatch)
    }
}

function hasPatches(patch) {
    for (var index in patch) {
        if (index !== "a") {
            return true
        }
    }

    return false
}

// Execute hooks when two nodes are identical
function unhook(vNode, patch, index) {
    if (isVNode(vNode)) {
        if (vNode.hooks) {
            patch[index] = appendPatch(
                patch[index],
                new VPatch(
                    VPatch.PROPS,
                    vNode,
                    undefinedKeys(vNode.hooks)
                )
            )
        }

        if (vNode.descendantHooks || vNode.hasThunks) {
            var children = vNode.children
            var len = children.length
            for (var i = 0; i < len; i++) {
                var child = children[i]
                index += 1

                unhook(child, patch, index)

                if (isVNode(child) && child.count) {
                    index += child.count
                }
            }
        }
    } else if (isThunk(vNode)) {
        thunks(vNode, null, patch, index)
    }
}

function undefinedKeys(obj) {
    var result = {}

    for (var key in obj) {
        result[key] = undefined
    }

    return result
}

// List diff, naive left to right reordering
function reorder(aChildren, bChildren) {
    // O(M) time, O(M) memory
    var bChildIndex = keyIndex(bChildren)
    var bKeys = bChildIndex.keys
    var bFree = bChildIndex.free

    if (bFree.length === bChildren.length) {
        return {
            children: bChildren,
            moves: null
        }
    }

    // O(N) time, O(N) memory
    var aChildIndex = keyIndex(aChildren)
    var aKeys = aChildIndex.keys
    var aFree = aChildIndex.free

    if (aFree.length === aChildren.length) {
        return {
            children: bChildren,
            moves: null
        }
    }

    // O(MAX(N, M)) memory
    var newChildren = []

    var freeIndex = 0
    var freeCount = bFree.length
    var deletedItems = 0

    // Iterate through a and match a node in b
    // O(N) time,
    for (var i = 0 ; i < aChildren.length; i++) {
        var aItem = aChildren[i]
        var itemIndex

        if (aItem.key) {
            if (bKeys.hasOwnProperty(aItem.key)) {
                // Match up the old keys
                itemIndex = bKeys[aItem.key]
                newChildren.push(bChildren[itemIndex])

            } else {
                // Remove old keyed items
                itemIndex = i - deletedItems++
                newChildren.push(null)
            }
        } else {
            // Match the item in a with the next free item in b
            if (freeIndex < freeCount) {
                itemIndex = bFree[freeIndex++]
                newChildren.push(bChildren[itemIndex])
            } else {
                // There are no free items in b to match with
                // the free items in a, so the extra free nodes
                // are deleted.
                itemIndex = i - deletedItems++
                newChildren.push(null)
            }
        }
    }

    var lastFreeIndex = freeIndex >= bFree.length ?
        bChildren.length :
        bFree[freeIndex]

    // Iterate through b and append any new keys
    // O(M) time
    for (var j = 0; j < bChildren.length; j++) {
        var newItem = bChildren[j]

        if (newItem.key) {
            if (!aKeys.hasOwnProperty(newItem.key)) {
                // Add any new keyed items
                // We are adding new items to the end and then sorting them
                // in place. In future we should insert new items in place.
                newChildren.push(newItem)
            }
        } else if (j >= lastFreeIndex) {
            // Add any leftover non-keyed items
            newChildren.push(newItem)
        }
    }

    var simulate = newChildren.slice()
    var simulateIndex = 0
    var removes = []
    var inserts = []
    var simulateItem

    for (var k = 0; k < bChildren.length;) {
        var wantedItem = bChildren[k]
        simulateItem = simulate[simulateIndex]

        // remove items
        while (simulateItem === null && simulate.length) {
            removes.push(remove(simulate, simulateIndex, null))
            simulateItem = simulate[simulateIndex]
        }

        if (!simulateItem || simulateItem.key !== wantedItem.key) {
            // if we need a key in this position...
            if (wantedItem.key) {
                if (simulateItem && simulateItem.key) {
                    // if an insert doesn't put this key in place, it needs to move
                    if (bKeys[simulateItem.key] !== k + 1) {
                        removes.push(remove(simulate, simulateIndex, simulateItem.key))
                        simulateItem = simulate[simulateIndex]
                        // if the remove didn't put the wanted item in place, we need to insert it
                        if (!simulateItem || simulateItem.key !== wantedItem.key) {
                            inserts.push({key: wantedItem.key, to: k})
                        }
                        // items are matching, so skip ahead
                        else {
                            simulateIndex++
                        }
                    }
                    else {
                        inserts.push({key: wantedItem.key, to: k})
                    }
                }
                else {
                    inserts.push({key: wantedItem.key, to: k})
                }
                k++
            }
            // a key in simulate has no matching wanted key, remove it
            else if (simulateItem && simulateItem.key) {
                removes.push(remove(simulate, simulateIndex, simulateItem.key))
            }
        }
        else {
            simulateIndex++
            k++
        }
    }

    // remove all the remaining nodes from simulate
    while(simulateIndex < simulate.length) {
        simulateItem = simulate[simulateIndex]
        removes.push(remove(simulate, simulateIndex, simulateItem && simulateItem.key))
    }

    // If the only moves we have are deletes then we can just
    // let the delete patch remove these items.
    if (removes.length === deletedItems && !inserts.length) {
        return {
            children: newChildren,
            moves: null
        }
    }

    return {
        children: newChildren,
        moves: {
            removes: removes,
            inserts: inserts
        }
    }
}

function remove(arr, index, key) {
    arr.splice(index, 1)

    return {
        from: index,
        key: key
    }
}

function keyIndex(children) {
    var keys = {}
    var free = []
    var length = children.length

    for (var i = 0; i < length; i++) {
        var child = children[i]

        if (child.key) {
            keys[child.key] = i
        } else {
            free.push(i)
        }
    }

    return {
        keys: keys,     // A hash of key name to index
        free: free      // An array of unkeyed item indices
    }
}

function appendPatch(apply, patch) {
    if (apply) {
        if (isArray(apply)) {
            apply.push(patch)
        } else {
            apply = [apply, patch]
        }

        return apply
    } else {
        return patch
    }
}

},{"../vnode/handle-thunk":13,"../vnode/is-thunk":14,"../vnode/is-vnode":16,"../vnode/is-vtext":17,"../vnode/is-widget":18,"../vnode/vpatch":21,"./diff-props":23,"x-is-array":25}],25:[function(require,module,exports){
var nativeIsArray = Array.isArray
var toString = Object.prototype.toString

module.exports = nativeIsArray || isArray

function isArray(obj) {
    return toString.call(obj) === "[object Array]"
}

},{}],26:[function(require,module,exports){
// Generated by psc-bundle 0.9.3
var PS = {};
(function(exports) {
    "use strict";

  // module Data.Functor

  exports.arrayMap = function (f) {
    return function (arr) {
      var l = arr.length;
      var result = new Array(l);
      for (var i = 0; i < l; i++) {
        result[i] = f(arr[i]);
      }
      return result;
    };
  };
})(PS["Data.Functor"] = PS["Data.Functor"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Semigroupoid = function (compose) {
      this.compose = compose;
  };
  var semigroupoidFn = new Semigroupoid(function (f) {
      return function (g) {
          return function (x) {
              return f(g(x));
          };
      };
  });
  var compose = function (dict) {
      return dict.compose;
  };
  exports["Semigroupoid"] = Semigroupoid;
  exports["compose"] = compose;
  exports["semigroupoidFn"] = semigroupoidFn;
})(PS["Control.Semigroupoid"] = PS["Control.Semigroupoid"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Control_Semigroupoid = PS["Control.Semigroupoid"];        
  var Category = function (__superclass_Control$dotSemigroupoid$dotSemigroupoid_0, id) {
      this["__superclass_Control.Semigroupoid.Semigroupoid_0"] = __superclass_Control$dotSemigroupoid$dotSemigroupoid_0;
      this.id = id;
  };
  var id = function (dict) {
      return dict.id;
  };
  var categoryFn = new Category(function () {
      return Control_Semigroupoid.semigroupoidFn;
  }, function (x) {
      return x;
  });
  exports["Category"] = Category;
  exports["id"] = id;
  exports["categoryFn"] = categoryFn;
})(PS["Control.Category"] = PS["Control.Category"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Control_Category = PS["Control.Category"];        
  var on = function (f) {
      return function (g) {
          return function (x) {
              return function (y) {
                  return f(g(x))(g(y));
              };
          };
      };
  };
  var flip = function (f) {
      return function (b) {
          return function (a) {
              return f(a)(b);
          };
      };
  };
  var $$const = function (a) {
      return function (v) {
          return a;
      };
  };
  var applyFlipped = function (x) {
      return function (f) {
          return f(x);
      };
  };
  var apply = function (f) {
      return function (x) {
          return f(x);
      };
  };
  exports["apply"] = apply;
  exports["applyFlipped"] = applyFlipped;
  exports["const"] = $$const;
  exports["flip"] = flip;
  exports["on"] = on;
})(PS["Data.Function"] = PS["Data.Function"] || {});
(function(exports) {
    "use strict";

  // module Data.Unit

  exports.unit = {};
})(PS["Data.Unit"] = PS["Data.Unit"] || {});
(function(exports) {
    "use strict";

  // module Data.Show

  exports.showIntImpl = function (n) {
    return n.toString();
  };

  exports.showStringImpl = function (s) {
    var l = s.length;
    return "\"" + s.replace(
      /[\0-\x1F\x7F"\\]/g,
      function (c, i) { // jshint ignore:line
        switch (c) {
          case "\"":
          case "\\":
            return "\\" + c;
          case "\x07": return "\\a";
          case "\b": return "\\b";
          case "\f": return "\\f";
          case "\n": return "\\n";
          case "\r": return "\\r";
          case "\t": return "\\t";
          case "\v": return "\\v";
        }
        var k = i + 1;
        var empty = k < l && s[k] >= "0" && s[k] <= "9" ? "\\&" : "";
        return "\\" + c.charCodeAt(0).toString(10) + empty;
      }
    ) + "\"";
  };
})(PS["Data.Show"] = PS["Data.Show"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Data.Show"];     
  var Show = function (show) {
      this.show = show;
  };
  var showString = new Show($foreign.showStringImpl);
  var showInt = new Show($foreign.showIntImpl);
  var show = function (dict) {
      return dict.show;
  };
  exports["Show"] = Show;
  exports["show"] = show;
  exports["showInt"] = showInt;
  exports["showString"] = showString;
})(PS["Data.Show"] = PS["Data.Show"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Data.Unit"];
  var Data_Show = PS["Data.Show"];
  exports["unit"] = $foreign.unit;
})(PS["Data.Unit"] = PS["Data.Unit"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Data.Functor"];
  var Data_Function = PS["Data.Function"];
  var Data_Unit = PS["Data.Unit"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];        
  var Functor = function (map) {
      this.map = map;
  };
  var map = function (dict) {
      return dict.map;
  };
  var $$void = function (dictFunctor) {
      return map(dictFunctor)(Data_Function["const"](Data_Unit.unit));
  };
  var voidLeft = function (dictFunctor) {
      return function (f) {
          return function (x) {
              return map(dictFunctor)(Data_Function["const"](x))(f);
          };
      };
  };
  var voidRight = function (dictFunctor) {
      return function (x) {
          return map(dictFunctor)(Data_Function["const"](x));
      };
  };
  var functorFn = new Functor(Control_Semigroupoid.compose(Control_Semigroupoid.semigroupoidFn));
  var functorArray = new Functor($foreign.arrayMap);
  exports["Functor"] = Functor;
  exports["map"] = map;
  exports["void"] = $$void;
  exports["voidLeft"] = voidLeft;
  exports["voidRight"] = voidRight;
  exports["functorFn"] = functorFn;
  exports["functorArray"] = functorArray;
})(PS["Data.Functor"] = PS["Data.Functor"] || {});
(function(exports) {
    "use strict";

  exports.concatArray = function (xs) {
    return function (ys) {
      return xs.concat(ys);
    };
  };
})(PS["Data.Semigroup"] = PS["Data.Semigroup"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Data.Semigroup"];
  var Data_Unit = PS["Data.Unit"];
  var Data_Void = PS["Data.Void"];        
  var Semigroup = function (append) {
      this.append = append;
  };                                                         
  var semigroupArray = new Semigroup($foreign.concatArray);
  var append = function (dict) {
      return dict.append;
  };
  exports["Semigroup"] = Semigroup;
  exports["append"] = append;
  exports["semigroupArray"] = semigroupArray;
})(PS["Data.Semigroup"] = PS["Data.Semigroup"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Data_Functor = PS["Data.Functor"];
  var Data_Semigroup = PS["Data.Semigroup"];        
  var Alt = function (__superclass_Data$dotFunctor$dotFunctor_0, alt) {
      this["__superclass_Data.Functor.Functor_0"] = __superclass_Data$dotFunctor$dotFunctor_0;
      this.alt = alt;
  };                                                       
  var alt = function (dict) {
      return dict.alt;
  };
  exports["Alt"] = Alt;
  exports["alt"] = alt;
})(PS["Control.Alt"] = PS["Control.Alt"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Control.Apply"];
  var Data_Functor = PS["Data.Functor"];
  var Data_Function = PS["Data.Function"];
  var Control_Category = PS["Control.Category"];        
  var Apply = function (__superclass_Data$dotFunctor$dotFunctor_0, apply) {
      this["__superclass_Data.Functor.Functor_0"] = __superclass_Data$dotFunctor$dotFunctor_0;
      this.apply = apply;
  };                      
  var apply = function (dict) {
      return dict.apply;
  };
  var applyFirst = function (dictApply) {
      return function (a) {
          return function (b) {
              return apply(dictApply)(Data_Functor.map(dictApply["__superclass_Data.Functor.Functor_0"]())(Data_Function["const"])(a))(b);
          };
      };
  };
  var applySecond = function (dictApply) {
      return function (a) {
          return function (b) {
              return apply(dictApply)(Data_Functor.map(dictApply["__superclass_Data.Functor.Functor_0"]())(Data_Function["const"](Control_Category.id(Control_Category.categoryFn)))(a))(b);
          };
      };
  };
  var lift2 = function (dictApply) {
      return function (f) {
          return function (a) {
              return function (b) {
                  return apply(dictApply)(Data_Functor.map(dictApply["__superclass_Data.Functor.Functor_0"]())(f)(a))(b);
              };
          };
      };
  };
  exports["Apply"] = Apply;
  exports["apply"] = apply;
  exports["applyFirst"] = applyFirst;
  exports["applySecond"] = applySecond;
  exports["lift2"] = lift2;
})(PS["Control.Apply"] = PS["Control.Apply"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Control_Apply = PS["Control.Apply"];
  var Data_Functor = PS["Data.Functor"];
  var Data_Unit = PS["Data.Unit"];        
  var Applicative = function (__superclass_Control$dotApply$dotApply_0, pure) {
      this["__superclass_Control.Apply.Apply_0"] = __superclass_Control$dotApply$dotApply_0;
      this.pure = pure;
  };
  var pure = function (dict) {
      return dict.pure;
  };
  var when = function (dictApplicative) {
      return function (v) {
          return function (v1) {
              if (v) {
                  return v1;
              };
              if (!v) {
                  return pure(dictApplicative)(Data_Unit.unit);
              };
              throw new Error("Failed pattern match at Control.Applicative line 58, column 1 - line 58, column 16: " + [ v.constructor.name, v1.constructor.name ]);
          };
      };
  };
  var liftA1 = function (dictApplicative) {
      return function (f) {
          return function (a) {
              return Control_Apply.apply(dictApplicative["__superclass_Control.Apply.Apply_0"]())(pure(dictApplicative)(f))(a);
          };
      };
  };
  exports["Applicative"] = Applicative;
  exports["liftA1"] = liftA1;
  exports["pure"] = pure;
  exports["when"] = when;
})(PS["Control.Applicative"] = PS["Control.Applicative"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Control.Bind"];
  var Control_Applicative = PS["Control.Applicative"];
  var Control_Apply = PS["Control.Apply"];
  var Control_Category = PS["Control.Category"];
  var Data_Function = PS["Data.Function"];
  var Data_Functor = PS["Data.Functor"];        
  var Bind = function (__superclass_Control$dotApply$dotApply_0, bind) {
      this["__superclass_Control.Apply.Apply_0"] = __superclass_Control$dotApply$dotApply_0;
      this.bind = bind;
  };                     
  var bind = function (dict) {
      return dict.bind;
  };
  var bindFlipped = function (dictBind) {
      return Data_Function.flip(bind(dictBind));
  };
  var composeKleisliFlipped = function (dictBind) {
      return function (f) {
          return function (g) {
              return function (a) {
                  return bindFlipped(dictBind)(f)(g(a));
              };
          };
      };
  };
  exports["Bind"] = Bind;
  exports["bind"] = bind;
  exports["bindFlipped"] = bindFlipped;
  exports["composeKleisliFlipped"] = composeKleisliFlipped;
})(PS["Control.Bind"] = PS["Control.Bind"] || {});
(function(exports) {
    "use strict";

  // module Unsafe.Coerce

  exports.unsafeCoerce = function (x) {
    return x;
  };
})(PS["Unsafe.Coerce"] = PS["Unsafe.Coerce"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Unsafe.Coerce"];
  exports["unsafeCoerce"] = $foreign.unsafeCoerce;
})(PS["Unsafe.Coerce"] = PS["Unsafe.Coerce"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Unsafe_Coerce = PS["Unsafe.Coerce"];        
  var runExists = Unsafe_Coerce.unsafeCoerce;
  var mkExists = Unsafe_Coerce.unsafeCoerce;
  exports["mkExists"] = mkExists;
  exports["runExists"] = runExists;
})(PS["Data.Exists"] = PS["Data.Exists"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Control_Applicative = PS["Control.Applicative"];
  var Control_Apply = PS["Control.Apply"];
  var Control_Bind = PS["Control.Bind"];
  var Data_Functor = PS["Data.Functor"];        
  var Monad = function (__superclass_Control$dotApplicative$dotApplicative_0, __superclass_Control$dotBind$dotBind_1) {
      this["__superclass_Control.Applicative.Applicative_0"] = __superclass_Control$dotApplicative$dotApplicative_0;
      this["__superclass_Control.Bind.Bind_1"] = __superclass_Control$dotBind$dotBind_1;
  };
  var ap = function (dictMonad) {
      return function (f) {
          return function (a) {
              return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(f)(function (v) {
                  return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(a)(function (v1) {
                      return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(v(v1));
                  });
              });
          };
      };
  };
  exports["Monad"] = Monad;
  exports["ap"] = ap;
})(PS["Control.Monad"] = PS["Control.Monad"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Control_Category = PS["Control.Category"];        
  var Bifunctor = function (bimap) {
      this.bimap = bimap;
  };
  var bimap = function (dict) {
      return dict.bimap;
  };
  var lmap = function (dictBifunctor) {
      return function (f) {
          return bimap(dictBifunctor)(f)(Control_Category.id(Control_Category.categoryFn));
      };
  };
  var rmap = function (dictBifunctor) {
      return bimap(dictBifunctor)(Control_Category.id(Control_Category.categoryFn));
  };
  exports["Bifunctor"] = Bifunctor;
  exports["bimap"] = bimap;
  exports["lmap"] = lmap;
  exports["rmap"] = rmap;
})(PS["Data.Bifunctor"] = PS["Data.Bifunctor"] || {});
(function(exports) {
    "use strict";

  // module Data.Eq

  exports.refEq = function (r1) {
    return function (r2) {
      return r1 === r2;
    };
  };
})(PS["Data.Eq"] = PS["Data.Eq"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Data.Eq"];
  var Data_Unit = PS["Data.Unit"];
  var Data_Void = PS["Data.Void"];        
  var Eq = function (eq) {
      this.eq = eq;
  }; 
  var eqUnit = new Eq(function (v) {
      return function (v1) {
          return true;
      };
  });
  var eqString = new Eq($foreign.refEq);
  var eqInt = new Eq($foreign.refEq);    
  var eq = function (dict) {
      return dict.eq;
  };
  exports["Eq"] = Eq;
  exports["eq"] = eq;
  exports["eqInt"] = eqInt;
  exports["eqString"] = eqString;
  exports["eqUnit"] = eqUnit;
})(PS["Data.Eq"] = PS["Data.Eq"] || {});
(function(exports) {
    "use strict";

  exports.foldrArray = function (f) {
    return function (init) {
      return function (xs) {
        var acc = init;
        var len = xs.length;
        for (var i = len - 1; i >= 0; i--) {
          acc = f(xs[i])(acc);
        }
        return acc;
      };
    };
  };

  exports.foldlArray = function (f) {
    return function (init) {
      return function (xs) {
        var acc = init;
        var len = xs.length;
        for (var i = 0; i < len; i++) {
          acc = f(acc)(xs[i]);
        }
        return acc;
      };
    };
  };
})(PS["Data.Foldable"] = PS["Data.Foldable"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Control_Alt = PS["Control.Alt"];
  var Data_Functor = PS["Data.Functor"];        
  var Plus = function (__superclass_Control$dotAlt$dotAlt_0, empty) {
      this["__superclass_Control.Alt.Alt_0"] = __superclass_Control$dotAlt$dotAlt_0;
      this.empty = empty;
  };       
  var empty = function (dict) {
      return dict.empty;
  };
  exports["Plus"] = Plus;
  exports["empty"] = empty;
})(PS["Control.Plus"] = PS["Control.Plus"] || {});
(function(exports) {
    "use strict";

  // module Data.HeytingAlgebra

  exports.boolConj = function (b1) {
    return function (b2) {
      return b1 && b2;
    };
  };

  exports.boolDisj = function (b1) {
    return function (b2) {
      return b1 || b2;
    };
  };

  exports.boolNot = function (b) {
    return !b;
  };
})(PS["Data.HeytingAlgebra"] = PS["Data.HeytingAlgebra"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Data.HeytingAlgebra"];
  var Data_Unit = PS["Data.Unit"];        
  var HeytingAlgebra = function (conj, disj, ff, implies, not, tt) {
      this.conj = conj;
      this.disj = disj;
      this.ff = ff;
      this.implies = implies;
      this.not = not;
      this.tt = tt;
  };
  var tt = function (dict) {
      return dict.tt;
  };
  var not = function (dict) {
      return dict.not;
  };
  var implies = function (dict) {
      return dict.implies;
  };                 
  var ff = function (dict) {
      return dict.ff;
  };
  var disj = function (dict) {
      return dict.disj;
  };
  var heytingAlgebraBoolean = new HeytingAlgebra($foreign.boolConj, $foreign.boolDisj, false, function (a) {
      return function (b) {
          return disj(heytingAlgebraBoolean)(not(heytingAlgebraBoolean)(a))(b);
      };
  }, $foreign.boolNot, true);
  var conj = function (dict) {
      return dict.conj;
  };
  exports["HeytingAlgebra"] = HeytingAlgebra;
  exports["conj"] = conj;
  exports["disj"] = disj;
  exports["ff"] = ff;
  exports["implies"] = implies;
  exports["not"] = not;
  exports["tt"] = tt;
  exports["heytingAlgebraBoolean"] = heytingAlgebraBoolean;
})(PS["Data.HeytingAlgebra"] = PS["Data.HeytingAlgebra"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Data_HeytingAlgebra = PS["Data.HeytingAlgebra"];
  var Data_Unit = PS["Data.Unit"];        
  var BooleanAlgebra = function (__superclass_Data$dotHeytingAlgebra$dotHeytingAlgebra_0) {
      this["__superclass_Data.HeytingAlgebra.HeytingAlgebra_0"] = __superclass_Data$dotHeytingAlgebra$dotHeytingAlgebra_0;
  }; 
  var booleanAlgebraBoolean = new BooleanAlgebra(function () {
      return Data_HeytingAlgebra.heytingAlgebraBoolean;
  });
  exports["BooleanAlgebra"] = BooleanAlgebra;
  exports["booleanAlgebraBoolean"] = booleanAlgebraBoolean;
})(PS["Data.BooleanAlgebra"] = PS["Data.BooleanAlgebra"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Data_Function = PS["Data.Function"];
  var Data_Semigroup = PS["Data.Semigroup"];
  var Data_Unit = PS["Data.Unit"];        
  var Monoid = function (__superclass_Data$dotSemigroup$dotSemigroup_0, mempty) {
      this["__superclass_Data.Semigroup.Semigroup_0"] = __superclass_Data$dotSemigroup$dotSemigroup_0;
      this.mempty = mempty;
  };     
  var monoidArray = new Monoid(function () {
      return Data_Semigroup.semigroupArray;
  }, [  ]);
  var mempty = function (dict) {
      return dict.mempty;
  };
  exports["Monoid"] = Monoid;
  exports["mempty"] = mempty;
  exports["monoidArray"] = monoidArray;
})(PS["Data.Monoid"] = PS["Data.Monoid"] || {});
(function(exports) {
    "use strict";

  // module Data.Ord.Unsafe

  exports.unsafeCompareImpl = function (lt) {
    return function (eq) {
      return function (gt) {
        return function (x) {
          return function (y) {
            return x < y ? lt : x > y ? gt : eq;
          };
        };
      };
    };
  };
})(PS["Data.Ord.Unsafe"] = PS["Data.Ord.Unsafe"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Data_Eq = PS["Data.Eq"];
  var Data_Semigroup = PS["Data.Semigroup"];
  var Data_Show = PS["Data.Show"];        
  var LT = (function () {
      function LT() {

      };
      LT.value = new LT();
      return LT;
  })();
  var GT = (function () {
      function GT() {

      };
      GT.value = new GT();
      return GT;
  })();
  var EQ = (function () {
      function EQ() {

      };
      EQ.value = new EQ();
      return EQ;
  })();
  exports["LT"] = LT;
  exports["GT"] = GT;
  exports["EQ"] = EQ;
})(PS["Data.Ordering"] = PS["Data.Ordering"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Data.Ord.Unsafe"];
  var Data_Ordering = PS["Data.Ordering"];        
  var unsafeCompare = $foreign.unsafeCompareImpl(Data_Ordering.LT.value)(Data_Ordering.EQ.value)(Data_Ordering.GT.value);
  exports["unsafeCompare"] = unsafeCompare;
})(PS["Data.Ord.Unsafe"] = PS["Data.Ord.Unsafe"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Data.Ord"];
  var Data_Eq = PS["Data.Eq"];
  var Data_Function = PS["Data.Function"];
  var Data_Ord_Unsafe = PS["Data.Ord.Unsafe"];
  var Data_Ordering = PS["Data.Ordering"];
  var Data_Ring = PS["Data.Ring"];
  var Data_Unit = PS["Data.Unit"];
  var Data_Void = PS["Data.Void"];
  var Data_Semiring = PS["Data.Semiring"];        
  var Ord = function (__superclass_Data$dotEq$dotEq_0, compare) {
      this["__superclass_Data.Eq.Eq_0"] = __superclass_Data$dotEq$dotEq_0;
      this.compare = compare;
  }; 
  var ordUnit = new Ord(function () {
      return Data_Eq.eqUnit;
  }, function (v) {
      return function (v1) {
          return Data_Ordering.EQ.value;
      };
  });                               
  var ordInt = new Ord(function () {
      return Data_Eq.eqInt;
  }, Data_Ord_Unsafe.unsafeCompare);
  var compare = function (dict) {
      return dict.compare;
  };
  exports["Ord"] = Ord;
  exports["compare"] = compare;
  exports["ordInt"] = ordInt;
  exports["ordUnit"] = ordUnit;
})(PS["Data.Ord"] = PS["Data.Ord"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Control_Alt = PS["Control.Alt"];
  var Control_Alternative = PS["Control.Alternative"];
  var Control_Applicative = PS["Control.Applicative"];
  var Control_Apply = PS["Control.Apply"];
  var Control_Bind = PS["Control.Bind"];
  var Control_Extend = PS["Control.Extend"];
  var Control_Monad = PS["Control.Monad"];
  var Control_MonadZero = PS["Control.MonadZero"];
  var Control_Plus = PS["Control.Plus"];
  var Data_Bounded = PS["Data.Bounded"];
  var Data_Eq = PS["Data.Eq"];
  var Data_Function = PS["Data.Function"];
  var Data_Functor = PS["Data.Functor"];
  var Data_Functor_Invariant = PS["Data.Functor.Invariant"];
  var Data_Monoid = PS["Data.Monoid"];
  var Data_Ord = PS["Data.Ord"];
  var Data_Ordering = PS["Data.Ordering"];
  var Data_Semigroup = PS["Data.Semigroup"];
  var Data_Show = PS["Data.Show"];
  var Data_Unit = PS["Data.Unit"];
  var Control_Category = PS["Control.Category"];        
  var Just = (function () {
      function Just(value0) {
          this.value0 = value0;
      };
      Just.create = function (value0) {
          return new Just(value0);
      };
      return Just;
  })();
  var Nothing = (function () {
      function Nothing() {

      };
      Nothing.value = new Nothing();
      return Nothing;
  })();
  var maybe = function (v) {
      return function (v1) {
          return function (v2) {
              if (v2 instanceof Nothing) {
                  return v;
              };
              if (v2 instanceof Just) {
                  return v1(v2.value0);
              };
              throw new Error("Failed pattern match at Data.Maybe line 232, column 1 - line 232, column 22: " + [ v.constructor.name, v1.constructor.name, v2.constructor.name ]);
          };
      };
  };
  var isNothing = maybe(true)(Data_Function["const"](false));
  var isJust = maybe(false)(Data_Function["const"](true));
  var functorMaybe = new Data_Functor.Functor(function (v) {
      return function (v1) {
          if (v1 instanceof Just) {
              return new Just(v(v1.value0));
          };
          return Nothing.value;
      };
  });
  var fromMaybe = function (a) {
      return maybe(a)(Control_Category.id(Control_Category.categoryFn));
  };
  var fromJust = function (dictPartial) {
      return function (v) {
          var __unused = function (dictPartial1) {
              return function ($dollar29) {
                  return $dollar29;
              };
          };
          return __unused(dictPartial)((function () {
              if (v instanceof Just) {
                  return v.value0;
              };
              throw new Error("Failed pattern match at Data.Maybe line 283, column 1 - line 283, column 21: " + [ v.constructor.name ]);
          })());
      };
  };
  exports["Just"] = Just;
  exports["Nothing"] = Nothing;
  exports["fromJust"] = fromJust;
  exports["fromMaybe"] = fromMaybe;
  exports["isJust"] = isJust;
  exports["isNothing"] = isNothing;
  exports["maybe"] = maybe;
  exports["functorMaybe"] = functorMaybe;
})(PS["Data.Maybe"] = PS["Data.Maybe"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Control_Applicative = PS["Control.Applicative"];
  var Control_Apply = PS["Control.Apply"];
  var Control_Bind = PS["Control.Bind"];
  var Control_Extend = PS["Control.Extend"];
  var Control_Monad = PS["Control.Monad"];
  var Data_Bounded = PS["Data.Bounded"];
  var Data_Eq = PS["Data.Eq"];
  var Data_Function = PS["Data.Function"];
  var Data_Functor = PS["Data.Functor"];
  var Data_Functor_Invariant = PS["Data.Functor.Invariant"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Monoid = PS["Data.Monoid"];
  var Data_Ord = PS["Data.Ord"];
  var Data_Semigroup = PS["Data.Semigroup"];
  var Data_Show = PS["Data.Show"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];        
  var First = function (x) {
      return x;
  };
  var semigroupFirst = new Data_Semigroup.Semigroup(function (v) {
      return function (v1) {
          if (v instanceof Data_Maybe.Just) {
              return v;
          };
          return v1;
      };
  });
  var runFirst = function (v) {
      return v;
  };
  var monoidFirst = new Data_Monoid.Monoid(function () {
      return semigroupFirst;
  }, Data_Maybe.Nothing.value);
  exports["First"] = First;
  exports["runFirst"] = runFirst;
  exports["semigroupFirst"] = semigroupFirst;
  exports["monoidFirst"] = monoidFirst;
})(PS["Data.Maybe.First"] = PS["Data.Maybe.First"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Control_Applicative = PS["Control.Applicative"];
  var Control_Apply = PS["Control.Apply"];
  var Control_Bind = PS["Control.Bind"];
  var Control_Comonad = PS["Control.Comonad"];
  var Control_Extend = PS["Control.Extend"];
  var Control_Monad = PS["Control.Monad"];
  var Data_HeytingAlgebra = PS["Data.HeytingAlgebra"];
  var Data_Bounded = PS["Data.Bounded"];
  var Data_Eq = PS["Data.Eq"];
  var Data_Functor = PS["Data.Functor"];
  var Data_Monoid = PS["Data.Monoid"];
  var Data_Ord = PS["Data.Ord"];
  var Data_Semigroup = PS["Data.Semigroup"];
  var Data_Semiring = PS["Data.Semiring"];
  var Data_Show = PS["Data.Show"];        
  var Disj = function (x) {
      return x;
  };
  var semigroupDisj = function (dictHeytingAlgebra) {
      return new Data_Semigroup.Semigroup(function (v) {
          return function (v1) {
              return Data_HeytingAlgebra.disj(dictHeytingAlgebra)(v)(v1);
          };
      });
  };
  var runDisj = function (v) {
      return v;
  };
  var monoidDisj = function (dictHeytingAlgebra) {
      return new Data_Monoid.Monoid(function () {
          return semigroupDisj(dictHeytingAlgebra);
      }, Data_HeytingAlgebra.ff(dictHeytingAlgebra));
  };
  exports["Disj"] = Disj;
  exports["runDisj"] = runDisj;
  exports["semigroupDisj"] = semigroupDisj;
  exports["monoidDisj"] = monoidDisj;
})(PS["Data.Monoid.Disj"] = PS["Data.Monoid.Disj"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Data.Foldable"];
  var Control_Applicative = PS["Control.Applicative"];
  var Control_Apply = PS["Control.Apply"];
  var Control_Plus = PS["Control.Plus"];
  var Data_BooleanAlgebra = PS["Data.BooleanAlgebra"];
  var Data_Eq = PS["Data.Eq"];
  var Data_Function = PS["Data.Function"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Maybe_First = PS["Data.Maybe.First"];
  var Data_Maybe_Last = PS["Data.Maybe.Last"];
  var Data_Monoid = PS["Data.Monoid"];
  var Data_Monoid_Additive = PS["Data.Monoid.Additive"];
  var Data_Monoid_Conj = PS["Data.Monoid.Conj"];
  var Data_Monoid_Disj = PS["Data.Monoid.Disj"];
  var Data_Monoid_Dual = PS["Data.Monoid.Dual"];
  var Data_Monoid_Endo = PS["Data.Monoid.Endo"];
  var Data_Monoid_Multiplicative = PS["Data.Monoid.Multiplicative"];
  var Data_Ord = PS["Data.Ord"];
  var Data_Ordering = PS["Data.Ordering"];
  var Data_Semiring = PS["Data.Semiring"];
  var Data_Unit = PS["Data.Unit"];
  var Control_Alt = PS["Control.Alt"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Control_Category = PS["Control.Category"];
  var Data_Semigroup = PS["Data.Semigroup"];
  var Data_HeytingAlgebra = PS["Data.HeytingAlgebra"];        
  var Foldable = function (foldMap, foldl, foldr) {
      this.foldMap = foldMap;
      this.foldl = foldl;
      this.foldr = foldr;
  };
  var foldr = function (dict) {
      return dict.foldr;
  };
  var traverse_ = function (dictApplicative) {
      return function (dictFoldable) {
          return function (f) {
              return foldr(dictFoldable)(function ($164) {
                  return Control_Apply.applySecond(dictApplicative["__superclass_Control.Apply.Apply_0"]())(f($164));
              })(Control_Applicative.pure(dictApplicative)(Data_Unit.unit));
          };
      };
  };
  var for_ = function (dictApplicative) {
      return function (dictFoldable) {
          return Data_Function.flip(traverse_(dictApplicative)(dictFoldable));
      };
  };
  var foldl = function (dict) {
      return dict.foldl;
  }; 
  var foldableMaybe = new Foldable(function (dictMonoid) {
      return function (f) {
          return function (v) {
              if (v instanceof Data_Maybe.Nothing) {
                  return Data_Monoid.mempty(dictMonoid);
              };
              if (v instanceof Data_Maybe.Just) {
                  return f(v.value0);
              };
              throw new Error("Failed pattern match at Data.Foldable line 132, column 3 - line 132, column 30: " + [ f.constructor.name, v.constructor.name ]);
          };
      };
  }, function (v) {
      return function (z) {
          return function (v1) {
              if (v1 instanceof Data_Maybe.Nothing) {
                  return z;
              };
              if (v1 instanceof Data_Maybe.Just) {
                  return v(z)(v1.value0);
              };
              throw new Error("Failed pattern match at Data.Foldable line 130, column 3 - line 130, column 25: " + [ v.constructor.name, z.constructor.name, v1.constructor.name ]);
          };
      };
  }, function (v) {
      return function (z) {
          return function (v1) {
              if (v1 instanceof Data_Maybe.Nothing) {
                  return z;
              };
              if (v1 instanceof Data_Maybe.Just) {
                  return v(v1.value0)(z);
              };
              throw new Error("Failed pattern match at Data.Foldable line 128, column 3 - line 128, column 25: " + [ v.constructor.name, z.constructor.name, v1.constructor.name ]);
          };
      };
  });
  var foldMapDefaultR = function (dictFoldable) {
      return function (dictMonoid) {
          return function (f) {
              return function (xs) {
                  return foldr(dictFoldable)(function (x) {
                      return function (acc) {
                          return Data_Semigroup.append(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(f(x))(acc);
                      };
                  })(Data_Monoid.mempty(dictMonoid))(xs);
              };
          };
      };
  };
  var foldableArray = new Foldable(function (dictMonoid) {
      return foldMapDefaultR(foldableArray)(dictMonoid);
  }, $foreign.foldlArray, $foreign.foldrArray);
  var foldMap = function (dict) {
      return dict.foldMap;
  };
  var any = function (dictFoldable) {
      return function (dictBooleanAlgebra) {
          return function (p) {
              return function ($167) {
                  return Data_Monoid_Disj.runDisj(foldMap(dictFoldable)(Data_Monoid_Disj.monoidDisj(dictBooleanAlgebra["__superclass_Data.HeytingAlgebra.HeytingAlgebra_0"]()))(function ($168) {
                      return Data_Monoid_Disj.Disj(p($168));
                  })($167));
              };
          };
      };
  };
  exports["Foldable"] = Foldable;
  exports["any"] = any;
  exports["foldMap"] = foldMap;
  exports["foldMapDefaultR"] = foldMapDefaultR;
  exports["foldl"] = foldl;
  exports["foldr"] = foldr;
  exports["for_"] = for_;
  exports["traverse_"] = traverse_;
  exports["foldableArray"] = foldableArray;
  exports["foldableMaybe"] = foldableMaybe;
})(PS["Data.Foldable"] = PS["Data.Foldable"] || {});
(function(exports) {
    "use strict";

  // module Data.Traversable

  // jshint maxparams: 3

  exports.traverseArrayImpl = function () {
    function Cont(fn) {
      this.fn = fn;
    }

    var emptyList = {};

    var ConsCell = function (head, tail) {
      this.head = head;
      this.tail = tail;
    };

    function consList(x) {
      return function (xs) {
        return new ConsCell(x, xs);
      };
    }

    function listToArray(list) {
      var arr = [];
      while (list !== emptyList) {
        arr.push(list.head);
        list = list.tail;
      }
      return arr;
    }

    return function (apply) {
      return function (map) {
        return function (pure) {
          return function (f) {
            var buildFrom = function (x, ys) {
              return apply(map(consList)(f(x)))(ys);
            };

            var go = function (acc, currentLen, xs) {
              if (currentLen === 0) {
                return acc;
              } else {
                var last = xs[currentLen - 1];
                return new Cont(function () {
                  return go(buildFrom(last, acc), currentLen - 1, xs);
                });
              }
            };

            return function (array) {
              var result = go(pure(emptyList), array.length, array);
              while (result instanceof Cont) {
                result = result.fn();
              }

              return map(listToArray)(result);
            };
          };
        };
      };
    };
  }();
})(PS["Data.Traversable"] = PS["Data.Traversable"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Data.Traversable"];
  var Control_Applicative = PS["Control.Applicative"];
  var Control_Apply = PS["Control.Apply"];
  var Control_Category = PS["Control.Category"];
  var Data_Foldable = PS["Data.Foldable"];
  var Data_Functor = PS["Data.Functor"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Maybe_First = PS["Data.Maybe.First"];
  var Data_Maybe_Last = PS["Data.Maybe.Last"];
  var Data_Monoid_Additive = PS["Data.Monoid.Additive"];
  var Data_Monoid_Conj = PS["Data.Monoid.Conj"];
  var Data_Monoid_Disj = PS["Data.Monoid.Disj"];
  var Data_Monoid_Dual = PS["Data.Monoid.Dual"];
  var Data_Monoid_Multiplicative = PS["Data.Monoid.Multiplicative"];
  var Traversable = function (__superclass_Data$dotFoldable$dotFoldable_1, __superclass_Data$dotFunctor$dotFunctor_0, sequence, traverse) {
      this["__superclass_Data.Foldable.Foldable_1"] = __superclass_Data$dotFoldable$dotFoldable_1;
      this["__superclass_Data.Functor.Functor_0"] = __superclass_Data$dotFunctor$dotFunctor_0;
      this.sequence = sequence;
      this.traverse = traverse;
  };
  var traverse = function (dict) {
      return dict.traverse;
  }; 
  var traversableMaybe = new Traversable(function () {
      return Data_Foldable.foldableMaybe;
  }, function () {
      return Data_Maybe.functorMaybe;
  }, function (dictApplicative) {
      return function (v) {
          if (v instanceof Data_Maybe.Nothing) {
              return Control_Applicative.pure(dictApplicative)(Data_Maybe.Nothing.value);
          };
          if (v instanceof Data_Maybe.Just) {
              return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Maybe.Just.create)(v.value0);
          };
          throw new Error("Failed pattern match at Data.Traversable line 88, column 3 - line 88, column 35: " + [ v.constructor.name ]);
      };
  }, function (dictApplicative) {
      return function (v) {
          return function (v1) {
              if (v1 instanceof Data_Maybe.Nothing) {
                  return Control_Applicative.pure(dictApplicative)(Data_Maybe.Nothing.value);
              };
              if (v1 instanceof Data_Maybe.Just) {
                  return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Maybe.Just.create)(v(v1.value0));
              };
              throw new Error("Failed pattern match at Data.Traversable line 86, column 3 - line 86, column 37: " + [ v.constructor.name, v1.constructor.name ]);
          };
      };
  });
  var sequenceDefault = function (dictTraversable) {
      return function (dictApplicative) {
          return function (tma) {
              return traverse(dictTraversable)(dictApplicative)(Control_Category.id(Control_Category.categoryFn))(tma);
          };
      };
  };
  var traversableArray = new Traversable(function () {
      return Data_Foldable.foldableArray;
  }, function () {
      return Data_Functor.functorArray;
  }, function (dictApplicative) {
      return sequenceDefault(traversableArray)(dictApplicative);
  }, function (dictApplicative) {
      return $foreign.traverseArrayImpl(Control_Apply.apply(dictApplicative["__superclass_Control.Apply.Apply_0"]()))(Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]()))(Control_Applicative.pure(dictApplicative));
  });
  var sequence = function (dict) {
      return dict.sequence;
  }; 
  var $$for = function (dictApplicative) {
      return function (dictTraversable) {
          return function (x) {
              return function (f) {
                  return traverse(dictTraversable)(dictApplicative)(f)(x);
              };
          };
      };
  };
  exports["Traversable"] = Traversable;
  exports["for"] = $$for;
  exports["sequence"] = sequence;
  exports["sequenceDefault"] = sequenceDefault;
  exports["traverse"] = traverse;
  exports["traversableArray"] = traversableArray;
  exports["traversableMaybe"] = traversableMaybe;
})(PS["Data.Traversable"] = PS["Data.Traversable"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Control_Alt = PS["Control.Alt"];
  var Control_Applicative = PS["Control.Applicative"];
  var Control_Apply = PS["Control.Apply"];
  var Control_Bind = PS["Control.Bind"];
  var Control_Extend = PS["Control.Extend"];
  var Control_Monad = PS["Control.Monad"];
  var Data_Bifoldable = PS["Data.Bifoldable"];
  var Data_Bifunctor = PS["Data.Bifunctor"];
  var Data_Bitraversable = PS["Data.Bitraversable"];
  var Data_Bounded = PS["Data.Bounded"];
  var Data_Eq = PS["Data.Eq"];
  var Data_Foldable = PS["Data.Foldable"];
  var Data_Function = PS["Data.Function"];
  var Data_Functor = PS["Data.Functor"];
  var Data_Functor_Invariant = PS["Data.Functor.Invariant"];
  var Data_Monoid = PS["Data.Monoid"];
  var Data_Ord = PS["Data.Ord"];
  var Data_Ordering = PS["Data.Ordering"];
  var Data_Semigroup = PS["Data.Semigroup"];
  var Data_Semiring = PS["Data.Semiring"];
  var Data_Show = PS["Data.Show"];
  var Data_Traversable = PS["Data.Traversable"];        
  var Left = (function () {
      function Left(value0) {
          this.value0 = value0;
      };
      Left.create = function (value0) {
          return new Left(value0);
      };
      return Left;
  })();
  var Right = (function () {
      function Right(value0) {
          this.value0 = value0;
      };
      Right.create = function (value0) {
          return new Right(value0);
      };
      return Right;
  })();
  var functorEither = new Data_Functor.Functor(function (v) {
      return function (v1) {
          if (v1 instanceof Left) {
              return new Left(v1.value0);
          };
          if (v1 instanceof Right) {
              return new Right(v(v1.value0));
          };
          throw new Error("Failed pattern match at Data.Either line 46, column 3 - line 46, column 26: " + [ v.constructor.name, v1.constructor.name ]);
      };
  });
  var eqEither = function (dictEq) {
      return function (dictEq1) {
          return new Data_Eq.Eq(function (v) {
              return function (v1) {
                  if (v instanceof Left && v1 instanceof Left) {
                      return Data_Eq.eq(dictEq)(v.value0)(v1.value0);
                  };
                  if (v instanceof Right && v1 instanceof Right) {
                      return Data_Eq.eq(dictEq1)(v.value0)(v1.value0);
                  };
                  return false;
              };
          });
      };
  };
  var ordEither = function (dictOrd) {
      return function (dictOrd1) {
          return new Data_Ord.Ord(function () {
              return eqEither(dictOrd["__superclass_Data.Eq.Eq_0"]())(dictOrd1["__superclass_Data.Eq.Eq_0"]());
          }, function (v) {
              return function (v1) {
                  if (v instanceof Left && v1 instanceof Left) {
                      return Data_Ord.compare(dictOrd)(v.value0)(v1.value0);
                  };
                  if (v instanceof Right && v1 instanceof Right) {
                      return Data_Ord.compare(dictOrd1)(v.value0)(v1.value0);
                  };
                  if (v instanceof Left) {
                      return Data_Ordering.LT.value;
                  };
                  if (v1 instanceof Left) {
                      return Data_Ordering.GT.value;
                  };
                  throw new Error("Failed pattern match at Data.Either line 188, column 3 - line 188, column 48: " + [ v.constructor.name, v1.constructor.name ]);
              };
          });
      };
  };
  var either = function (v) {
      return function (v1) {
          return function (v2) {
              if (v2 instanceof Left) {
                  return v(v2.value0);
              };
              if (v2 instanceof Right) {
                  return v1(v2.value0);
              };
              throw new Error("Failed pattern match at Data.Either line 243, column 1 - line 243, column 26: " + [ v.constructor.name, v1.constructor.name, v2.constructor.name ]);
          };
      };
  };
  var isLeft = either(Data_Function["const"](true))(Data_Function["const"](false));
  var bifunctorEither = new Data_Bifunctor.Bifunctor(function (v) {
      return function (v1) {
          return function (v2) {
              if (v2 instanceof Left) {
                  return new Left(v(v2.value0));
              };
              if (v2 instanceof Right) {
                  return new Right(v1(v2.value0));
              };
              throw new Error("Failed pattern match at Data.Either line 53, column 3 - line 53, column 34: " + [ v.constructor.name, v1.constructor.name, v2.constructor.name ]);
          };
      };
  });
  var applyEither = new Control_Apply.Apply(function () {
      return functorEither;
  }, function (v) {
      return function (v1) {
          if (v instanceof Left) {
              return new Left(v.value0);
          };
          if (v instanceof Right) {
              return Data_Functor.map(functorEither)(v.value0)(v1);
          };
          throw new Error("Failed pattern match at Data.Either line 89, column 3 - line 89, column 28: " + [ v.constructor.name, v1.constructor.name ]);
      };
  });
  var bindEither = new Control_Bind.Bind(function () {
      return applyEither;
  }, either(function (e) {
      return function (v) {
          return new Left(e);
      };
  })(function (a) {
      return function (f) {
          return f(a);
      };
  }));
  var applicativeEither = new Control_Applicative.Applicative(function () {
      return applyEither;
  }, Right.create);
  exports["Left"] = Left;
  exports["Right"] = Right;
  exports["either"] = either;
  exports["isLeft"] = isLeft;
  exports["functorEither"] = functorEither;
  exports["bifunctorEither"] = bifunctorEither;
  exports["applyEither"] = applyEither;
  exports["applicativeEither"] = applicativeEither;
  exports["bindEither"] = bindEither;
  exports["eqEither"] = eqEither;
  exports["ordEither"] = ordEither;
})(PS["Data.Either"] = PS["Data.Either"] || {});
(function(exports) {
    "use strict";

  // module Control.Monad.Eff

  exports.pureE = function (a) {
    return function () {
      return a;
    };
  };

  exports.bindE = function (a) {
    return function (f) {
      return function () {
        return f(a())();
      };
    };
  };

  exports.runPure = function (f) {
    return f();
  };

  exports.foreachE = function (as) {
    return function (f) {
      return function () {
        for (var i = 0, l = as.length; i < l; i++) {
          f(as[i])();
        }
      };
    };
  };
})(PS["Control.Monad.Eff"] = PS["Control.Monad.Eff"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Control.Monad.Eff"];
  var Control_Applicative = PS["Control.Applicative"];
  var Control_Apply = PS["Control.Apply"];
  var Control_Bind = PS["Control.Bind"];
  var Control_Monad = PS["Control.Monad"];
  var Data_Functor = PS["Data.Functor"];
  var Data_Unit = PS["Data.Unit"];        
  var monadEff = new Control_Monad.Monad(function () {
      return applicativeEff;
  }, function () {
      return bindEff;
  });
  var bindEff = new Control_Bind.Bind(function () {
      return applyEff;
  }, $foreign.bindE);
  var applyEff = new Control_Apply.Apply(function () {
      return functorEff;
  }, Control_Monad.ap(monadEff));
  var applicativeEff = new Control_Applicative.Applicative(function () {
      return applyEff;
  }, $foreign.pureE);
  var functorEff = new Data_Functor.Functor(Control_Applicative.liftA1(applicativeEff));
  exports["functorEff"] = functorEff;
  exports["applyEff"] = applyEff;
  exports["applicativeEff"] = applicativeEff;
  exports["bindEff"] = bindEff;
  exports["monadEff"] = monadEff;
  exports["foreachE"] = $foreign.foreachE;
  exports["runPure"] = $foreign.runPure;
})(PS["Control.Monad.Eff"] = PS["Control.Monad.Eff"] || {});
(function(exports) {
  /* global exports */
  "use strict";

  exports.writeSTRef = function (ref) {
    return function (a) {
      return function () {
        /* jshint boss: true */
        return ref.value = a;
      };
    };
  };
})(PS["Control.Monad.ST"] = PS["Control.Monad.ST"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Control.Monad.ST"];
  var Control_Monad_Eff = PS["Control.Monad.Eff"];
  exports["writeSTRef"] = $foreign.writeSTRef;
})(PS["Control.Monad.ST"] = PS["Control.Monad.ST"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Control_Alt = PS["Control.Alt"];
  var Control_Applicative = PS["Control.Applicative"];
  var Control_Apply = PS["Control.Apply"];
  var Control_Bind = PS["Control.Bind"];
  var Control_Comonad = PS["Control.Comonad"];
  var Control_Extend = PS["Control.Extend"];
  var Control_Monad = PS["Control.Monad"];
  var Data_BooleanAlgebra = PS["Data.BooleanAlgebra"];
  var Data_Bounded = PS["Data.Bounded"];
  var Data_CommutativeRing = PS["Data.CommutativeRing"];
  var Data_Eq = PS["Data.Eq"];
  var Data_EuclideanRing = PS["Data.EuclideanRing"];
  var Data_Field = PS["Data.Field"];
  var Data_Foldable = PS["Data.Foldable"];
  var Data_Functor = PS["Data.Functor"];
  var Data_Functor_Invariant = PS["Data.Functor.Invariant"];
  var Data_HeytingAlgebra = PS["Data.HeytingAlgebra"];
  var Data_Monoid = PS["Data.Monoid"];
  var Data_Ord = PS["Data.Ord"];
  var Data_Ring = PS["Data.Ring"];
  var Data_Semigroup = PS["Data.Semigroup"];
  var Data_Semiring = PS["Data.Semiring"];
  var Data_Show = PS["Data.Show"];
  var Data_Traversable = PS["Data.Traversable"];        
  var Identity = function (x) {
      return x;
  };
  var runIdentity = function (v) {
      return v;
  };
  var functorIdentity = new Data_Functor.Functor(function (f) {
      return function (v) {
          return f(v);
      };
  });
  var applyIdentity = new Control_Apply.Apply(function () {
      return functorIdentity;
  }, function (v) {
      return function (v1) {
          return v(v1);
      };
  });
  var bindIdentity = new Control_Bind.Bind(function () {
      return applyIdentity;
  }, function (v) {
      return function (f) {
          return f(v);
      };
  });
  var applicativeIdentity = new Control_Applicative.Applicative(function () {
      return applyIdentity;
  }, Identity);
  var monadIdentity = new Control_Monad.Monad(function () {
      return applicativeIdentity;
  }, function () {
      return bindIdentity;
  });
  exports["Identity"] = Identity;
  exports["runIdentity"] = runIdentity;
  exports["functorIdentity"] = functorIdentity;
  exports["applyIdentity"] = applyIdentity;
  exports["applicativeIdentity"] = applicativeIdentity;
  exports["bindIdentity"] = bindIdentity;
  exports["monadIdentity"] = monadIdentity;
})(PS["Data.Identity"] = PS["Data.Identity"] || {});
(function(exports) {
    "use strict";

  // module Partial.Unsafe

  exports.unsafePartial = function (f) {
    return f();
  };
})(PS["Partial.Unsafe"] = PS["Partial.Unsafe"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Partial.Unsafe"];
  var Partial = PS["Partial"];
  exports["unsafePartial"] = $foreign.unsafePartial;
})(PS["Partial.Unsafe"] = PS["Partial.Unsafe"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Control_Monad_Eff = PS["Control.Monad.Eff"];
  var Control_Monad_Eff_Unsafe = PS["Control.Monad.Eff.Unsafe"];
  var Control_Monad_ST = PS["Control.Monad.ST"];
  var Data_Either = PS["Data.Either"];
  var Data_Identity = PS["Data.Identity"];
  var Partial_Unsafe = PS["Partial.Unsafe"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Control_Bind = PS["Control.Bind"];
  var Control_Applicative = PS["Control.Applicative"];
  var Data_Function = PS["Data.Function"];
  var Data_Functor = PS["Data.Functor"];
  var Data_Unit = PS["Data.Unit"];        
  var MonadRec = function (__superclass_Control$dotMonad$dotMonad_0, tailRecM) {
      this["__superclass_Control.Monad.Monad_0"] = __superclass_Control$dotMonad$dotMonad_0;
      this.tailRecM = tailRecM;
  };
  var tailRecM = function (dict) {
      return dict.tailRecM;
  };             
  var forever = function (dictMonadRec) {
      return function (ma) {
          return tailRecM(dictMonadRec)(function (u) {
              return Data_Functor.voidRight((((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(new Data_Either.Left(u))(ma);
          })(Data_Unit.unit);
      };
  };
  exports["MonadRec"] = MonadRec;
  exports["forever"] = forever;
  exports["tailRecM"] = tailRecM;
})(PS["Control.Monad.Rec.Class"] = PS["Control.Monad.Rec.Class"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];        
  var MonadTrans = function (lift) {
      this.lift = lift;
  };
  var lift = function (dict) {
      return dict.lift;
  };
  exports["MonadTrans"] = MonadTrans;
  exports["lift"] = lift;
})(PS["Control.Monad.Trans"] = PS["Control.Monad.Trans"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Data_Exists = PS["Data.Exists"];
  var Data_Either = PS["Data.Either"];
  var Data_Bifunctor = PS["Data.Bifunctor"];
  var Control_Bind = PS["Control.Bind"];
  var Control_Monad_Rec_Class = PS["Control.Monad.Rec.Class"];
  var Control_Monad_Trans = PS["Control.Monad.Trans"];
  var Data_Functor = PS["Data.Functor"];
  var Data_Unit = PS["Data.Unit"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Control_Apply = PS["Control.Apply"];
  var Control_Monad = PS["Control.Monad"];
  var Control_Applicative = PS["Control.Applicative"];
  var Control_Category = PS["Control.Category"];        
  var Bound = (function () {
      function Bound(value0, value1) {
          this.value0 = value0;
          this.value1 = value1;
      };
      Bound.create = function (value0) {
          return function (value1) {
              return new Bound(value0, value1);
          };
      };
      return Bound;
  })();
  var FreeT = (function () {
      function FreeT(value0) {
          this.value0 = value0;
      };
      FreeT.create = function (value0) {
          return new FreeT(value0);
      };
      return FreeT;
  })();
  var Bind = (function () {
      function Bind(value0) {
          this.value0 = value0;
      };
      Bind.create = function (value0) {
          return new Bind(value0);
      };
      return Bind;
  })();
  var monadTransFreeT = function (dictFunctor) {
      return new Control_Monad_Trans.MonadTrans(function (dictMonad) {
          return function (ma) {
              return new FreeT(function (v) {
                  return Data_Functor.map(((dictMonad["__superclass_Control.Bind.Bind_1"]())["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Either.Left.create)(ma);
              });
          };
      });
  };
  var freeT = FreeT.create;
  var bound = function (m) {
      return function (f) {
          return new Bind(Data_Exists.mkExists(new Bound(m, f)));
      };
  };
  var functorFreeT = function (dictFunctor) {
      return function (dictFunctor1) {
          return new Data_Functor.Functor(function (f) {
              return function (v) {
                  if (v instanceof FreeT) {
                      return new FreeT(function (v1) {
                          return Data_Functor.map(dictFunctor1)(Data_Bifunctor.bimap(Data_Either.bifunctorEither)(f)(Data_Functor.map(dictFunctor)(Data_Functor.map(functorFreeT(dictFunctor)(dictFunctor1))(f))))(v.value0(Data_Unit.unit));
                      });
                  };
                  if (v instanceof Bind) {
                      return Data_Exists.runExists(function (v1) {
                          return bound(v1.value0)(function ($98) {
                              return Data_Functor.map(functorFreeT(dictFunctor)(dictFunctor1))(f)(v1.value1($98));
                          });
                      })(v.value0);
                  };
                  throw new Error("Failed pattern match at Control.Monad.Free.Trans line 55, column 3 - line 55, column 69: " + [ f.constructor.name, v.constructor.name ]);
              };
          });
      };
  };
  var bimapFreeT = function (dictFunctor) {
      return function (dictFunctor1) {
          return function (nf) {
              return function (nm) {
                  return function (v) {
                      if (v instanceof Bind) {
                          return Data_Exists.runExists(function (v1) {
                              return bound(function ($99) {
                                  return bimapFreeT(dictFunctor)(dictFunctor1)(nf)(nm)(v1.value0($99));
                              })(function ($100) {
                                  return bimapFreeT(dictFunctor)(dictFunctor1)(nf)(nm)(v1.value1($100));
                              });
                          })(v.value0);
                      };
                      if (v instanceof FreeT) {
                          return new FreeT(function (v1) {
                              return Data_Functor.map(dictFunctor1)(Data_Functor.map(Data_Either.functorEither)(function ($101) {
                                  return nf(Data_Functor.map(dictFunctor)(bimapFreeT(dictFunctor)(dictFunctor1)(nf)(nm))($101));
                              }))(nm(v.value0(Data_Unit.unit)));
                          });
                      };
                      throw new Error("Failed pattern match at Control.Monad.Free.Trans line 96, column 1 - line 96, column 114: " + [ nf.constructor.name, nm.constructor.name, v.constructor.name ]);
                  };
              };
          };
      };
  };
  var hoistFreeT = function (dictFunctor) {
      return function (dictFunctor1) {
          return bimapFreeT(dictFunctor)(dictFunctor1)(Control_Category.id(Control_Category.categoryFn));
      };
  };
  var interpret = function (dictFunctor) {
      return function (dictFunctor1) {
          return function (nf) {
              return bimapFreeT(dictFunctor)(dictFunctor1)(nf)(Control_Category.id(Control_Category.categoryFn));
          };
      };
  };
  var monadFreeT = function (dictFunctor) {
      return function (dictMonad) {
          return new Control_Monad.Monad(function () {
              return applicativeFreeT(dictFunctor)(dictMonad);
          }, function () {
              return bindFreeT(dictFunctor)(dictMonad);
          });
      };
  };
  var bindFreeT = function (dictFunctor) {
      return function (dictMonad) {
          return new Control_Bind.Bind(function () {
              return applyFreeT(dictFunctor)(dictMonad);
          }, function (v) {
              return function (f) {
                  if (v instanceof Bind) {
                      return Data_Exists.runExists(function (v1) {
                          return bound(v1.value0)(function (x) {
                              return bound(function (v2) {
                                  return v1.value1(x);
                              })(f);
                          });
                      })(v.value0);
                  };
                  return bound(function (v1) {
                      return v;
                  })(f);
              };
          });
      };
  };
  var applyFreeT = function (dictFunctor) {
      return function (dictMonad) {
          return new Control_Apply.Apply(function () {
              return functorFreeT(dictFunctor)(((dictMonad["__superclass_Control.Bind.Bind_1"]())["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]());
          }, Control_Monad.ap(monadFreeT(dictFunctor)(dictMonad)));
      };
  };
  var applicativeFreeT = function (dictFunctor) {
      return function (dictMonad) {
          return new Control_Applicative.Applicative(function () {
              return applyFreeT(dictFunctor)(dictMonad);
          }, function (a) {
              return new FreeT(function (v) {
                  return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(new Data_Either.Left(a));
              });
          });
      };
  };
  var liftFreeT = function (dictFunctor) {
      return function (dictMonad) {
          return function (fa) {
              return new FreeT(function (v) {
                  return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(new Data_Either.Right(Data_Functor.map(dictFunctor)(Control_Applicative.pure(applicativeFreeT(dictFunctor)(dictMonad)))(fa)));
              });
          };
      };
  };
  var resume = function (dictFunctor) {
      return function (dictMonadRec) {
          var go = function (v) {
              if (v instanceof FreeT) {
                  return Data_Functor.map((((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Either.Right.create)(v.value0(Data_Unit.unit));
              };
              if (v instanceof Bind) {
                  return Data_Exists.runExists(function (v1) {
                      var $77 = v1.value0(Data_Unit.unit);
                      if ($77 instanceof FreeT) {
                          return Control_Bind.bind((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())($77.value0(Data_Unit.unit))(function (v2) {
                              if (v2 instanceof Data_Either.Left) {
                                  return Control_Applicative.pure((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())(new Data_Either.Left(v1.value1(v2.value0)));
                              };
                              if (v2 instanceof Data_Either.Right) {
                                  return Control_Applicative.pure((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())(new Data_Either.Right(new Data_Either.Right(Data_Functor.map(dictFunctor)(function (h) {
                                      return Control_Bind.bind(bindFreeT(dictFunctor)(dictMonadRec["__superclass_Control.Monad.Monad_0"]()))(h)(v1.value1);
                                  })(v2.value0))));
                              };
                              throw new Error("Failed pattern match at Control.Monad.Free.Trans line 49, column 9 - line 51, column 68: " + [ v2.constructor.name ]);
                          });
                      };
                      if ($77 instanceof Bind) {
                          return Data_Exists.runExists(function (v2) {
                              return Control_Applicative.pure((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())(new Data_Either.Left(Control_Bind.bind(bindFreeT(dictFunctor)(dictMonadRec["__superclass_Control.Monad.Monad_0"]()))(v2.value0(Data_Unit.unit))(function (z) {
                                  return Control_Bind.bind(bindFreeT(dictFunctor)(dictMonadRec["__superclass_Control.Monad.Monad_0"]()))(v2.value1(z))(v1.value1);
                              })));
                          })($77.value0);
                      };
                      throw new Error("Failed pattern match at Control.Monad.Free.Trans line 46, column 5 - line 52, column 98: " + [ $77.constructor.name ]);
                  })(v.value0);
              };
              throw new Error("Failed pattern match at Control.Monad.Free.Trans line 44, column 3 - line 44, column 36: " + [ v.constructor.name ]);
          };
          return Control_Monad_Rec_Class.tailRecM(dictMonadRec)(go);
      };
  };
  var runFreeT = function (dictFunctor) {
      return function (dictMonadRec) {
          return function (interp) {
              var go = function (v) {
                  if (v instanceof Data_Either.Left) {
                      return Control_Applicative.pure((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())(new Data_Either.Right(v.value0));
                  };
                  if (v instanceof Data_Either.Right) {
                      return Control_Bind.bind((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(interp(v.value0))(function (v1) {
                          return Control_Applicative.pure((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())(new Data_Either.Left(v1));
                      });
                  };
                  throw new Error("Failed pattern match at Control.Monad.Free.Trans line 104, column 3 - line 104, column 31: " + [ v.constructor.name ]);
              };
              return Control_Monad_Rec_Class.tailRecM(dictMonadRec)(Control_Bind.composeKleisliFlipped((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(go)(resume(dictFunctor)(dictMonadRec)));
          };
      };
  };
  var monadRecFreeT = function (dictFunctor) {
      return function (dictMonad) {
          return new Control_Monad_Rec_Class.MonadRec(function () {
              return monadFreeT(dictFunctor)(dictMonad);
          }, function (f) {
              var go = function (s) {
                  return Control_Bind.bind(bindFreeT(dictFunctor)(dictMonad))(f(s))(function (v) {
                      if (v instanceof Data_Either.Left) {
                          return go(v.value0);
                      };
                      if (v instanceof Data_Either.Right) {
                          return Control_Applicative.pure(applicativeFreeT(dictFunctor)(dictMonad))(v.value0);
                      };
                      throw new Error("Failed pattern match at Control.Monad.Free.Trans line 78, column 7 - line 80, column 26: " + [ v.constructor.name ]);
                  });
              };
              return go;
          });
      };
  };
  exports["bimapFreeT"] = bimapFreeT;
  exports["freeT"] = freeT;
  exports["hoistFreeT"] = hoistFreeT;
  exports["interpret"] = interpret;
  exports["liftFreeT"] = liftFreeT;
  exports["resume"] = resume;
  exports["runFreeT"] = runFreeT;
  exports["functorFreeT"] = functorFreeT;
  exports["applyFreeT"] = applyFreeT;
  exports["applicativeFreeT"] = applicativeFreeT;
  exports["bindFreeT"] = bindFreeT;
  exports["monadFreeT"] = monadFreeT;
  exports["monadTransFreeT"] = monadTransFreeT;
  exports["monadRecFreeT"] = monadRecFreeT;
})(PS["Control.Monad.Free.Trans"] = PS["Control.Monad.Free.Trans"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Control_Alt = PS["Control.Alt"];
  var Control_Alternative = PS["Control.Alternative"];
  var Control_Apply = PS["Control.Apply"];
  var Control_Monad_Cont_Trans = PS["Control.Monad.Cont.Trans"];
  var Control_Monad_Except_Trans = PS["Control.Monad.Except.Trans"];
  var Control_Monad_Reader_Trans = PS["Control.Monad.Reader.Trans"];
  var Control_Monad_Eff = PS["Control.Monad.Eff"];
  var Control_Monad_Eff_Ref = PS["Control.Monad.Eff.Ref"];
  var Control_Monad_Eff_Unsafe = PS["Control.Monad.Eff.Unsafe"];
  var Control_Plus = PS["Control.Plus"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Foldable = PS["Data.Foldable"];
  var Data_Traversable = PS["Data.Traversable"];
  var Control_Bind = PS["Control.Bind"];
  var Control_Applicative = PS["Control.Applicative"];
  var Data_Unit = PS["Data.Unit"];
  var Data_Functor = PS["Data.Functor"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Data_Function = PS["Data.Function"];
  var Data_Either = PS["Data.Either"];        
  var Parallel = function (x) {
      return x;
  };
  var MonadPar = function (__superclass_Control$dotMonad$dotMonad_0, par) {
      this["__superclass_Control.Monad.Monad_0"] = __superclass_Control$dotMonad$dotMonad_0;
      this.par = par;
  };
  var runParallel = function (v) {
      return v;
  };
  var parallel = Parallel;
  var par = function (dict) {
      return dict.par;
  }; 
  var functorParallel = function (dictFunctor) {
      return new Data_Functor.Functor(function (f) {
          return function ($58) {
              return parallel(Data_Functor.map(dictFunctor)(f)(runParallel($58)));
          };
      });
  };
  var applyParallel = function (dictMonadPar) {
      return new Control_Apply.Apply(function () {
          return functorParallel((((dictMonadPar["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]());
      }, function (f) {
          return function (a) {
              return parallel(par(dictMonadPar)(Data_Function.apply)(runParallel(f))(runParallel(a)));
          };
      });
  };
  exports["MonadPar"] = MonadPar;
  exports["par"] = par;
  exports["parallel"] = parallel;
  exports["runParallel"] = runParallel;
  exports["functorParallel"] = functorParallel;
  exports["applyParallel"] = applyParallel;
})(PS["Control.Parallel.Class"] = PS["Control.Parallel.Class"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Control_Category = PS["Control.Category"];        
  var Profunctor = function (dimap) {
      this.dimap = dimap;
  };
  var profunctorFn = new Profunctor(function (a2b) {
      return function (c2d) {
          return function (b2c) {
              return function ($4) {
                  return c2d(b2c(a2b($4)));
              };
          };
      };
  });
  var dimap = function (dict) {
      return dict.dimap;
  };
  var rmap = function (dictProfunctor) {
      return function (b2c) {
          return dimap(dictProfunctor)(Control_Category.id(Control_Category.categoryFn))(b2c);
      };
  };
  exports["Profunctor"] = Profunctor;
  exports["dimap"] = dimap;
  exports["rmap"] = rmap;
  exports["profunctorFn"] = profunctorFn;
})(PS["Data.Profunctor"] = PS["Data.Profunctor"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Control_Applicative = PS["Control.Applicative"];
  var Control_Apply = PS["Control.Apply"];
  var Control_Biapplicative = PS["Control.Biapplicative"];
  var Control_Biapply = PS["Control.Biapply"];
  var Control_Bind = PS["Control.Bind"];
  var Control_Comonad = PS["Control.Comonad"];
  var Control_Extend = PS["Control.Extend"];
  var Control_Lazy = PS["Control.Lazy"];
  var Control_Monad = PS["Control.Monad"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Data_Bifoldable = PS["Data.Bifoldable"];
  var Data_Bifunctor = PS["Data.Bifunctor"];
  var Data_Bitraversable = PS["Data.Bitraversable"];
  var Data_BooleanAlgebra = PS["Data.BooleanAlgebra"];
  var Data_Bounded = PS["Data.Bounded"];
  var Data_Eq = PS["Data.Eq"];
  var Data_Foldable = PS["Data.Foldable"];
  var Data_Function = PS["Data.Function"];
  var Data_Functor = PS["Data.Functor"];
  var Data_Functor_Invariant = PS["Data.Functor.Invariant"];
  var Data_HeytingAlgebra = PS["Data.HeytingAlgebra"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Maybe_First = PS["Data.Maybe.First"];
  var Data_Monoid = PS["Data.Monoid"];
  var Data_Ord = PS["Data.Ord"];
  var Data_Ordering = PS["Data.Ordering"];
  var Data_Ring = PS["Data.Ring"];
  var Data_CommutativeRing = PS["Data.CommutativeRing"];
  var Data_Semigroup = PS["Data.Semigroup"];
  var Data_Semiring = PS["Data.Semiring"];
  var Data_Show = PS["Data.Show"];
  var Data_Traversable = PS["Data.Traversable"];
  var Data_Unit = PS["Data.Unit"];        
  var Tuple = (function () {
      function Tuple(value0, value1) {
          this.value0 = value0;
          this.value1 = value1;
      };
      Tuple.create = function (value0) {
          return function (value1) {
              return new Tuple(value0, value1);
          };
      };
      return Tuple;
  })();
  var uncurry = function (f) {
      return function (v) {
          return f(v.value0)(v.value1);
      };
  };
  var snd = function (v) {
      return v.value1;
  };
  var functorTuple = new Data_Functor.Functor(function (f) {
      return function (v) {
          return new Tuple(v.value0, f(v.value1));
      };
  });                                                                                                   
  var fst = function (v) {
      return v.value0;
  };
  var foldableTuple = new Data_Foldable.Foldable(function (dictMonoid) {
      return function (f) {
          return function (v) {
              return f(v.value1);
          };
      };
  }, function (f) {
      return function (z) {
          return function (v) {
              return f(z)(v.value1);
          };
      };
  }, function (f) {
      return function (z) {
          return function (v) {
              return f(v.value1)(z);
          };
      };
  });
  var traversableTuple = new Data_Traversable.Traversable(function () {
      return foldableTuple;
  }, function () {
      return functorTuple;
  }, function (dictApplicative) {
      return function (v) {
          return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Tuple.create(v.value0))(v.value1);
      };
  }, function (dictApplicative) {
      return function (f) {
          return function (v) {
              return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Tuple.create(v.value0))(f(v.value1));
          };
      };
  });
  exports["Tuple"] = Tuple;
  exports["fst"] = fst;
  exports["snd"] = snd;
  exports["uncurry"] = uncurry;
  exports["functorTuple"] = functorTuple;
  exports["foldableTuple"] = foldableTuple;
  exports["traversableTuple"] = traversableTuple;
})(PS["Data.Tuple"] = PS["Data.Tuple"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Control_Apply = PS["Control.Apply"];
  var Control_Monad_Free_Trans = PS["Control.Monad.Free.Trans"];
  var Control_Monad_Rec_Class = PS["Control.Monad.Rec.Class"];
  var Control_Monad_Trans = PS["Control.Monad.Trans"];
  var Control_Parallel_Class = PS["Control.Parallel.Class"];
  var Data_Bifunctor = PS["Data.Bifunctor"];
  var Data_Either = PS["Data.Either"];
  var Data_Functor = PS["Data.Functor"];
  var Data_Identity = PS["Data.Identity"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Profunctor = PS["Data.Profunctor"];
  var Data_Tuple = PS["Data.Tuple"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Control_Applicative = PS["Control.Applicative"];
  var Data_Unit = PS["Data.Unit"];
  var Control_Bind = PS["Control.Bind"];
  var Control_Category = PS["Control.Category"];
  var profunctorAwait = new Data_Profunctor.Profunctor(function (f) {
      return function (g) {
          return function (v) {
              return Data_Profunctor.dimap(Data_Profunctor.profunctorFn)(f)(g)(v);
          };
      };
  });
  var fuseWith = function (dictFunctor) {
      return function (dictFunctor1) {
          return function (dictFunctor2) {
              return function (dictMonadRec) {
                  return function (dictMonadPar) {
                      return function (zap) {
                          return function (fs) {
                              return function (gs) {
                                  var go = function (v) {
                                      return Control_Bind.bind((dictMonadPar["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(Control_Parallel_Class.runParallel(Control_Apply.apply(Control_Parallel_Class.applyParallel(dictMonadPar))(Data_Functor.map(Control_Parallel_Class.functorParallel((((dictMonadPar["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]()))(Control_Apply.lift2(Data_Either.applyEither)(zap(Data_Tuple.Tuple.create)))(Control_Parallel_Class.parallel(Control_Monad_Free_Trans.resume(dictFunctor)(dictMonadRec)(v.value0))))(Control_Parallel_Class.parallel(Control_Monad_Free_Trans.resume(dictFunctor1)(dictMonadRec)(v.value1)))))(function (v1) {
                                          if (v1 instanceof Data_Either.Left) {
                                              return Control_Applicative.pure((dictMonadPar["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())(new Data_Either.Left(v1.value0));
                                          };
                                          if (v1 instanceof Data_Either.Right) {
                                              return Control_Applicative.pure((dictMonadPar["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())(new Data_Either.Right(Data_Functor.map(dictFunctor2)(function (t) {
                                                  return Control_Monad_Free_Trans.freeT(function (v2) {
                                                      return go(t);
                                                  });
                                              })(v1.value0)));
                                          };
                                          throw new Error("Failed pattern match at Control.Coroutine line 73, column 5 - line 75, column 63: " + [ v1.constructor.name ]);
                                      });
                                  };
                                  return Control_Monad_Free_Trans.freeT(function (v) {
                                      return go(new Data_Tuple.Tuple(fs, gs));
                                  });
                              };
                          };
                      };
                  };
              };
          };
      };
  };
  var functorAwait = new Data_Functor.Functor(Data_Profunctor.rmap(profunctorAwait));
  var $$await = function (dictMonad) {
      return Control_Monad_Free_Trans.liftFreeT(functorAwait)(dictMonad)(Control_Category.id(Control_Category.categoryFn));
  };
  exports["await"] = $$await;
  exports["fuseWith"] = fuseWith;
  exports["profunctorAwait"] = profunctorAwait;
  exports["functorAwait"] = functorAwait;
})(PS["Control.Coroutine"] = PS["Control.Coroutine"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Control_Category = PS["Control.Category"];
  var Control_Monad = PS["Control.Monad"];
  var Control_Monad_Eff = PS["Control.Monad.Eff"];        
  var MonadEff = function (__superclass_Control$dotMonad$dotMonad_0, liftEff) {
      this["__superclass_Control.Monad.Monad_0"] = __superclass_Control$dotMonad$dotMonad_0;
      this.liftEff = liftEff;
  };
  var monadEffEff = new MonadEff(function () {
      return Control_Monad_Eff.monadEff;
  }, Control_Category.id(Control_Category.categoryFn));
  var liftEff = function (dict) {
      return dict.liftEff;
  };
  exports["MonadEff"] = MonadEff;
  exports["liftEff"] = liftEff;
  exports["monadEffEff"] = monadEffEff;
})(PS["Control.Monad.Eff.Class"] = PS["Control.Monad.Eff.Class"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Either = PS["Data.Either"];
  var Data_Function = PS["Data.Function"];
  var Data_Unit = PS["Data.Unit"];        
  var MonadError = function (__superclass_Control$dotMonad$dotMonad_0, catchError, throwError) {
      this["__superclass_Control.Monad.Monad_0"] = __superclass_Control$dotMonad$dotMonad_0;
      this.catchError = catchError;
      this.throwError = throwError;
  };
  var throwError = function (dict) {
      return dict.throwError;
  };                          
  var catchError = function (dict) {
      return dict.catchError;
  };
  exports["MonadError"] = MonadError;
  exports["catchError"] = catchError;
  exports["throwError"] = throwError;
})(PS["Control.Monad.Error.Class"] = PS["Control.Monad.Error.Class"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Data_Tuple = PS["Data.Tuple"];
  var Data_Unit = PS["Data.Unit"];        
  var MonadState = function (__superclass_Control$dotMonad$dotMonad_0, state) {
      this["__superclass_Control.Monad.Monad_0"] = __superclass_Control$dotMonad$dotMonad_0;
      this.state = state;
  };
  var state = function (dict) {
      return dict.state;
  };
  var modify = function (dictMonadState) {
      return function (f) {
          return state(dictMonadState)(function (s) {
              return new Data_Tuple.Tuple(Data_Unit.unit, f(s));
          });
      };
  };
  var get = function (dictMonadState) {
      return state(dictMonadState)(function (s) {
          return new Data_Tuple.Tuple(s, s);
      });
  };
  exports["MonadState"] = MonadState;
  exports["get"] = get;
  exports["modify"] = modify;
  exports["state"] = state;
})(PS["Control.Monad.State.Class"] = PS["Control.Monad.State.Class"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Control_Alt = PS["Control.Alt"];
  var Control_Alternative = PS["Control.Alternative"];
  var Control_Monad_Cont_Class = PS["Control.Monad.Cont.Class"];
  var Control_Monad_Eff_Class = PS["Control.Monad.Eff.Class"];
  var Control_Monad_Error_Class = PS["Control.Monad.Error.Class"];
  var Control_Monad_Reader_Class = PS["Control.Monad.Reader.Class"];
  var Control_Monad_Rec_Class = PS["Control.Monad.Rec.Class"];
  var Control_Monad_RWS_Class = PS["Control.Monad.RWS.Class"];
  var Control_Monad_State_Class = PS["Control.Monad.State.Class"];
  var Control_Monad_Trans = PS["Control.Monad.Trans"];
  var Control_Monad_Writer_Class = PS["Control.Monad.Writer.Class"];
  var Control_MonadPlus = PS["Control.MonadPlus"];
  var Control_MonadZero = PS["Control.MonadZero"];
  var Control_Plus = PS["Control.Plus"];
  var Data_Either = PS["Data.Either"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Tuple = PS["Data.Tuple"];
  var Data_Functor = PS["Data.Functor"];
  var Control_Applicative = PS["Control.Applicative"];
  var Control_Apply = PS["Control.Apply"];
  var Control_Monad = PS["Control.Monad"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Control_Bind = PS["Control.Bind"];
  var Data_Function = PS["Data.Function"];
  var Control_Category = PS["Control.Category"];        
  var MaybeT = function (x) {
      return x;
  };
  var runMaybeT = function (v) {
      return v;
  };
  var monadMaybeT = function (dictMonad) {
      return new Control_Monad.Monad(function () {
          return applicativeMaybeT(dictMonad);
      }, function () {
          return bindMaybeT(dictMonad);
      });
  };
  var functorMaybeT = function (dictMonad) {
      return new Data_Functor.Functor(Control_Applicative.liftA1(applicativeMaybeT(dictMonad)));
  };
  var bindMaybeT = function (dictMonad) {
      return new Control_Bind.Bind(function () {
          return applyMaybeT(dictMonad);
      }, function (v) {
          return function (f) {
              return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(v)(function (v1) {
                  if (v1 instanceof Data_Maybe.Nothing) {
                      return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(Data_Maybe.Nothing.value);
                  };
                  if (v1 instanceof Data_Maybe.Just) {
                      var $36 = f(v1.value0);
                      return $36;
                  };
                  throw new Error("Failed pattern match at Control.Monad.Maybe.Trans line 55, column 5 - line 58, column 22: " + [ v1.constructor.name ]);
              });
          };
      });
  };
  var applyMaybeT = function (dictMonad) {
      return new Control_Apply.Apply(function () {
          return functorMaybeT(dictMonad);
      }, Control_Monad.ap(monadMaybeT(dictMonad)));
  };
  var applicativeMaybeT = function (dictMonad) {
      return new Control_Applicative.Applicative(function () {
          return applyMaybeT(dictMonad);
      }, function ($61) {
          return MaybeT(Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(Data_Maybe.Just.create($61)));
      });
  };
  var monadRecMaybeT = function (dictMonadRec) {
      return new Control_Monad_Rec_Class.MonadRec(function () {
          return monadMaybeT(dictMonadRec["__superclass_Control.Monad.Monad_0"]());
      }, function (f) {
          return function ($63) {
              return MaybeT(Control_Monad_Rec_Class.tailRecM(dictMonadRec)(function (a) {
                  var $42 = f(a);
                  return Control_Bind.bind((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())($42)(function (m$prime) {
                      return Control_Applicative.pure((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())((function () {
                          if (m$prime instanceof Data_Maybe.Nothing) {
                              return new Data_Either.Right(Data_Maybe.Nothing.value);
                          };
                          if (m$prime instanceof Data_Maybe.Just && m$prime.value0 instanceof Data_Either.Left) {
                              return new Data_Either.Left(m$prime.value0.value0);
                          };
                          if (m$prime instanceof Data_Maybe.Just && m$prime.value0 instanceof Data_Either.Right) {
                              return new Data_Either.Right(new Data_Maybe.Just(m$prime.value0.value0));
                          };
                          throw new Error("Failed pattern match at Control.Monad.Maybe.Trans line 86, column 11 - line 89, column 45: " + [ m$prime.constructor.name ]);
                      })());
                  });
              })($63));
          };
      });
  };
  var altMaybeT = function (dictMonad) {
      return new Control_Alt.Alt(function () {
          return functorMaybeT(dictMonad);
      }, function (v) {
          return function (v1) {
              return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(v)(function (v2) {
                  if (v2 instanceof Data_Maybe.Nothing) {
                      return v1;
                  };
                  return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(v2);
              });
          };
      });
  };
  var plusMaybeT = function (dictMonad) {
      return new Control_Plus.Plus(function () {
          return altMaybeT(dictMonad);
      }, Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(Data_Maybe.Nothing.value));
  };
  exports["MaybeT"] = MaybeT;
  exports["runMaybeT"] = runMaybeT;
  exports["functorMaybeT"] = functorMaybeT;
  exports["applyMaybeT"] = applyMaybeT;
  exports["applicativeMaybeT"] = applicativeMaybeT;
  exports["bindMaybeT"] = bindMaybeT;
  exports["monadMaybeT"] = monadMaybeT;
  exports["altMaybeT"] = altMaybeT;
  exports["plusMaybeT"] = plusMaybeT;
  exports["monadRecMaybeT"] = monadRecMaybeT;
})(PS["Control.Monad.Maybe.Trans"] = PS["Control.Monad.Maybe.Trans"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Control_Coroutine = PS["Control.Coroutine"];
  var Control_Monad_Free_Trans = PS["Control.Monad.Free.Trans"];
  var Control_Monad_Maybe_Trans = PS["Control.Monad.Maybe.Trans"];
  var Control_Monad_Rec_Class = PS["Control.Monad.Rec.Class"];
  var Control_Monad_Trans = PS["Control.Monad.Trans"];
  var Control_Parallel_Class = PS["Control.Parallel.Class"];
  var Control_Plus = PS["Control.Plus"];
  var Data_Bifunctor = PS["Data.Bifunctor"];
  var Data_Either = PS["Data.Either"];
  var Data_Identity = PS["Data.Identity"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Functor = PS["Data.Functor"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Control_Applicative = PS["Control.Applicative"];
  var Data_Function = PS["Data.Function"];
  var Data_Unit = PS["Data.Unit"];
  var Control_Bind = PS["Control.Bind"];        
  var Emit = (function () {
      function Emit(value0, value1) {
          this.value0 = value0;
          this.value1 = value1;
      };
      Emit.create = function (value0) {
          return function (value1) {
              return new Emit(value0, value1);
          };
      };
      return Emit;
  })();
  var Stall = (function () {
      function Stall(value0) {
          this.value0 = value0;
      };
      Stall.create = function (value0) {
          return new Stall(value0);
      };
      return Stall;
  })();
  var runStallingProcess = function (dictMonadRec) {
      return function ($31) {
          return Control_Monad_Maybe_Trans.runMaybeT(Control_Monad_Free_Trans.runFreeT(Data_Maybe.functorMaybe)(Control_Monad_Maybe_Trans.monadRecMaybeT(dictMonadRec))(Data_Maybe.maybe(Control_Plus.empty(Control_Monad_Maybe_Trans.plusMaybeT(dictMonadRec["__superclass_Control.Monad.Monad_0"]())))(Control_Applicative.pure(Control_Monad_Maybe_Trans.applicativeMaybeT(dictMonadRec["__superclass_Control.Monad.Monad_0"]()))))(Control_Monad_Free_Trans.hoistFreeT(Data_Maybe.functorMaybe)(Control_Monad_Maybe_Trans.functorMaybeT(dictMonadRec["__superclass_Control.Monad.Monad_0"]()))(function ($32) {
              return Control_Monad_Maybe_Trans.MaybeT(Data_Functor.map((((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Maybe.Just.create)($32));
          })($31)));
      };
  };
  var bifunctorStallF = new Data_Bifunctor.Bifunctor(function (f) {
      return function (g) {
          return function (v) {
              if (v instanceof Emit) {
                  return new Emit(f(v.value0), g(v.value1));
              };
              if (v instanceof Stall) {
                  return new Stall(g(v.value0));
              };
              throw new Error("Failed pattern match at Control.Coroutine.Stalling line 51, column 15 - line 53, column 27: " + [ v.constructor.name ]);
          };
      };
  });
  var functorStallF = new Data_Functor.Functor(function (f) {
      return Data_Bifunctor.rmap(bifunctorStallF)(f);
  });
  var fuse = function (dictMonadRec) {
      return function (dictMonadPar) {
          return Control_Coroutine.fuseWith(functorStallF)(Control_Coroutine.functorAwait)(Data_Maybe.functorMaybe)(dictMonadRec)(dictMonadPar)(function (f) {
              return function (q) {
                  return function (v) {
                      if (q instanceof Emit) {
                          return new Data_Maybe.Just(f(q.value1)(v(q.value0)));
                      };
                      if (q instanceof Stall) {
                          return Data_Maybe.Nothing.value;
                      };
                      throw new Error("Failed pattern match at Control.Coroutine.Stalling line 86, column 5 - line 88, column 27: " + [ q.constructor.name ]);
                  };
              };
          });
      };
  };
  exports["Emit"] = Emit;
  exports["Stall"] = Stall;
  exports["fuse"] = fuse;
  exports["runStallingProcess"] = runStallingProcess;
  exports["bifunctorStallF"] = bifunctorStallF;
  exports["functorStallF"] = functorStallF;
})(PS["Control.Coroutine.Stalling"] = PS["Control.Coroutine.Stalling"] || {});
(function(exports) {
  /* global exports */
  "use strict";

  exports._forkAff = function (nonCanceler, aff) {
    var voidF = function(){};

    return function(success, error) {
      var canceler = aff(voidF, voidF);
      success(canceler);
      return nonCanceler;
    };
  }

  exports._forkAll = function (nonCanceler, foldl, affs) {
    var voidF = function(){};

    return function(success, error) {
      try {
        var cancelers = foldl(function(acc) {
          return function(aff) {
            acc.push(aff(voidF, voidF));
            return acc;
          }
        })([])(affs);
      } catch (err) {
        error(err)
      }

      var canceler = function(e) {
        return function(success, error) {
          var cancellations = 0;
          var result        = false;
          var errored       = false;

          var s = function(bool) {
            cancellations = cancellations + 1;
            result        = result || bool;

            if (cancellations === cancelers.length && !errored) {
              success(result);
            }
          };

          var f = function(err) {
            if (!errored) {
              errored = true;
              error(err);
            }
          };

          for (var i = 0; i < cancelers.length; i++) {
            cancelers[i](e)(s, f);
          }

          return nonCanceler;
        };
      };

      success(canceler);
      return nonCanceler;
    };
  }

  exports._makeAff = function (cb) {
    return function(success, error) {
      try {
        return cb(function(e) {
          return function() {
            error(e);
          };
        })(function(v) {
          return function() {
            success(v);
          };
        })();
      } catch (err) {
        error(err);
      }
    }
  }

  exports._pure = function (nonCanceler, v) {
    return function(success, error) {
      success(v);
      return nonCanceler;
    };
  }

  exports._throwError = function (nonCanceler, e) {
    return function(success, error) {
      error(e);
      return nonCanceler;
    };
  }

  exports._fmap = function (f, aff) {
    return function(success, error) {
      try {
        return aff(function(v) {
          try {
            var v2 = f(v);
          } catch (err) {
            error(err)
          }
          success(v2);
        }, error);
      } catch (err) {
        error(err);
      }
    };
  }

  exports._bind = function (alwaysCanceler, aff, f) {
    return function(success, error) {
      var canceler1, canceler2;

      var isCanceled    = false;
      var requestCancel = false;

      var onCanceler = function(){};

      canceler1 = aff(function(v) {
        if (requestCancel) {
          isCanceled = true;

          return alwaysCanceler;
        } else {
          canceler2 = f(v)(success, error);

          onCanceler(canceler2);

          return canceler2;
        }
      }, error);

      return function(e) {
        return function(s, f) {
          requestCancel = true;

          if (canceler2 !== undefined) {
            return canceler2(e)(s, f);
          } else {
            return canceler1(e)(function(bool) {
              if (bool || isCanceled) {
                s(true);
              } else {
                onCanceler = function(canceler) {
                  canceler(e)(s, f);
                };
              }
            }, f);
          }
        };
      };
    };
  }

  exports._attempt = function (Left, Right, aff) {
    return function(success, error) {
      try {
        return aff(function(v) {
          success(Right(v));
        }, function(e) {
          success(Left(e));
        });
      } catch (err) {
        success(Left(err));
      }
    };
  }

  exports._runAff = function (errorT, successT, aff) {
    return function() {
      return aff(function(v) {
        successT(v)();
      }, function(e) {
        errorT(e)();
      });
    };
  }

  exports._liftEff = function (nonCanceler, e) {
    return function(success, error) {
      var result;
      try {
        result = e();
      } catch (err) {
        error(err);
        return nonCanceler;
      }

      success(result);
      return nonCanceler;
    };
  }

  exports._tailRecM = function (isLeft, f, a) {
    return function(success, error) {
      return function go(acc) {
        var result, status, canceler;

        // Observes synchronous effects using a flag.
        //   status = 0 (unresolved status)
        //   status = 1 (synchronous effect)
        //   status = 2 (asynchronous effect)
        while (true) {
          status = 0;
          canceler = f(acc)(function(v) {
            // If the status is still unresolved, we have observed a
            // synchronous effect. Otherwise, the status will be `2`.
            if (status === 0) {
              // Store the result for further synchronous processing.
              result = v;
              status = 1;
            } else {
              // When we have observed an asynchronous effect, we use normal
              // recursion. This is safe because we will be on a new stack.
              if (isLeft(v)) {
                go(v.value0);
              } else {
                try {
                  success(v.value0);
                } catch (err) {
                  error(err);
                }
              }
            }
          }, error);

          // If the status has already resolved to `1` by our Aff handler, then
          // we have observed a synchronous effect. Otherwise it will still be
          // `0`.
          if (status === 1) {
            // When we have observed a synchronous effect, we merely swap out the
            // accumulator and continue the loop, preserving stack.
            if (isLeft(result)) {
              acc = result.value0;
              continue;
            } else {
              try {
                success(result.value0);
              } catch (err) {
                error(err);
              }
            }
          } else {
            // If the status has not resolved yet, then we have observed an
            // asynchronous effect.
            status = 2;
          }
          return canceler;
        }

      }(a);
    };
  };
})(PS["Control.Monad.Aff"] = PS["Control.Monad.Aff"] || {});
(function(exports) {
  /* global exports */
  "use strict";

  exports._makeVar = function (nonCanceler) {
    return function(success, error) {
      try {
        success({
          consumers: [],
          producers: [],
          error: undefined
        });
      } catch (err) {
        error(err);
      }

      return nonCanceler;
    };
  };

  exports._takeVar = function (nonCanceler, avar) {
    return function(success, error) {
      if (avar.error !== undefined) {
        error(avar.error);
      } else if (avar.producers.length > 0) {
        var producer = avar.producers.shift();

        producer(success, error);
      } else {
        avar.consumers.push({success: success, error: error});
      }

      return nonCanceler;
    };
  };

  exports._putVar = function (nonCanceler, avar, a) {
    return function(success, error) {
      if (avar.error !== undefined) {
        error(avar.error);
      } else if (avar.consumers.length === 0) {
        avar.producers.push(function(success, error) {
          try {
            success(a);
          } catch (err) {
            error(err);
          }
        });

        success({});
      } else {
        var consumer = avar.consumers.shift();

        try {
          consumer.success(a);
        } catch (err) {
          error(err);

          return;
        }

        success({});
      }

      return nonCanceler;
    };
  };

  exports._killVar = function (nonCanceler, avar, e) {
    return function(success, error) {
      if (avar.error !== undefined) {
        error(avar.error);
      } else {
        var errors = [];

        avar.error = e;

        while (avar.consumers.length > 0) {
          var consumer = avar.consumers.shift();

          try {
            consumer.error(e);
          } catch (err) {
            errors.push(err);
          }
        }

        if (errors.length > 0) error(errors[0]);
        else success({});
      }

      return nonCanceler;
    };
  };
})(PS["Control.Monad.Aff.Internal"] = PS["Control.Monad.Aff.Internal"] || {});
(function(exports) {
  /* global exports */
  "use strict";

  exports.error = function (msg) {
    return new Error(msg);
  };

  exports.message = function (e) {
    return e.message;
  };

  exports.throwException = function (e) {
    return function () {
      throw e;
    };
  };

  exports.catchException = function (c) {
    return function (t) {
      return function () {
        try {
          return t();
        } catch (e) {
          if (e instanceof Error || Object.prototype.toString.call(e) === "[object Error]") {
            return c(e)();
          } else {
            return c(new Error(e.toString()))();
          }
        }
      };
    };
  };
})(PS["Control.Monad.Eff.Exception"] = PS["Control.Monad.Eff.Exception"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Control.Monad.Eff.Exception"];
  var Control_Monad_Eff = PS["Control.Monad.Eff"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Data_Either = PS["Data.Either"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Show = PS["Data.Show"];
  var Prelude = PS["Prelude"];
  var Control_Applicative = PS["Control.Applicative"];
  var Data_Functor = PS["Data.Functor"];        
  var $$try = function (action) {
      return $foreign.catchException(function ($0) {
          return Control_Applicative.pure(Control_Monad_Eff.applicativeEff)(Data_Either.Left.create($0));
      })(Data_Functor.map(Control_Monad_Eff.functorEff)(Data_Either.Right.create)(action));
  };
  exports["try"] = $$try;
  exports["error"] = $foreign.error;
  exports["message"] = $foreign.message;
  exports["throwException"] = $foreign.throwException;
})(PS["Control.Monad.Eff.Exception"] = PS["Control.Monad.Eff.Exception"] || {});
(function(exports) {
    "use strict";

  exports.runFn2 = function (fn) {
    return function (a) {
      return function (b) {
        return fn(a, b);
      };
    };
  };

  exports.runFn4 = function (fn) {
    return function (a) {
      return function (b) {
        return function (c) {
          return function (d) {
            return fn(a, b, c, d);
          };
        };
      };
    };
  };
})(PS["Data.Function.Uncurried"] = PS["Data.Function.Uncurried"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Data.Function.Uncurried"];
  var Data_Unit = PS["Data.Unit"];
  exports["runFn2"] = $foreign.runFn2;
  exports["runFn4"] = $foreign.runFn4;
})(PS["Data.Function.Uncurried"] = PS["Data.Function.Uncurried"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Control.Monad.Aff.Internal"];
  var Prelude = PS["Prelude"];
  var Control_Monad_Eff_Exception = PS["Control.Monad.Eff.Exception"];
  var Data_Function_Uncurried = PS["Data.Function.Uncurried"];
  exports["_killVar"] = $foreign._killVar;
  exports["_makeVar"] = $foreign._makeVar;
  exports["_putVar"] = $foreign._putVar;
  exports["_takeVar"] = $foreign._takeVar;
})(PS["Control.Monad.Aff.Internal"] = PS["Control.Monad.Aff.Internal"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Control.Monad.Aff"];
  var Prelude = PS["Prelude"];
  var Control_Alt = PS["Control.Alt"];
  var Control_Alternative = PS["Control.Alternative"];
  var Control_Monad_Aff_Internal = PS["Control.Monad.Aff.Internal"];
  var Control_Monad_Cont_Class = PS["Control.Monad.Cont.Class"];
  var Control_Monad_Eff = PS["Control.Monad.Eff"];
  var Control_Monad_Eff_Class = PS["Control.Monad.Eff.Class"];
  var Control_Monad_Eff_Exception = PS["Control.Monad.Eff.Exception"];
  var Control_Monad_Error_Class = PS["Control.Monad.Error.Class"];
  var Control_Monad_Rec_Class = PS["Control.Monad.Rec.Class"];
  var Control_MonadPlus = PS["Control.MonadPlus"];
  var Control_Parallel_Class = PS["Control.Parallel.Class"];
  var Control_Plus = PS["Control.Plus"];
  var Data_Either = PS["Data.Either"];
  var Data_Foldable = PS["Data.Foldable"];
  var Data_Function_Uncurried = PS["Data.Function.Uncurried"];
  var Data_Monoid = PS["Data.Monoid"];
  var Unsafe_Coerce = PS["Unsafe.Coerce"];
  var Data_Semigroup = PS["Data.Semigroup"];
  var Control_Apply = PS["Control.Apply"];
  var Data_Functor = PS["Data.Functor"];
  var Control_Applicative = PS["Control.Applicative"];
  var Control_Bind = PS["Control.Bind"];
  var Control_Monad = PS["Control.Monad"];
  var Data_Function = PS["Data.Function"];
  var Control_MonadZero = PS["Control.MonadZero"];
  var Data_HeytingAlgebra = PS["Data.HeytingAlgebra"];
  var Data_Eq = PS["Data.Eq"];
  var Data_Unit = PS["Data.Unit"];
  var Data_Semiring = PS["Data.Semiring"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var runAff = function (ex) {
      return function (f) {
          return function (aff) {
              return $foreign._runAff(ex, f, aff);
          };
      };
  };
  var makeAff$prime = function (h) {
      return $foreign._makeAff(h);
  };
  var functorAff = new Data_Functor.Functor(function (f) {
      return function (fa) {
          return $foreign._fmap(f, fa);
      };
  });
  var fromAVBox = Unsafe_Coerce.unsafeCoerce;
  var attempt = function (aff) {
      return $foreign._attempt(Data_Either.Left.create, Data_Either.Right.create, aff);
  };
  var applyAff = new Control_Apply.Apply(function () {
      return functorAff;
  }, function (ff) {
      return function (fa) {
          return $foreign._bind(alwaysCanceler, ff, function (f) {
              return Data_Functor.map(functorAff)(f)(fa);
          });
      };
  });
  var applicativeAff = new Control_Applicative.Applicative(function () {
      return applyAff;
  }, function (v) {
      return $foreign._pure(nonCanceler, v);
  });
  var nonCanceler = Data_Function["const"](Control_Applicative.pure(applicativeAff)(false));
  var alwaysCanceler = Data_Function["const"](Control_Applicative.pure(applicativeAff)(true));
  var forkAff = function (aff) {
      return $foreign._forkAff(nonCanceler, aff);
  };
  var forkAll = function (dictFoldable) {
      return function (affs) {
          return $foreign._forkAll(nonCanceler, Data_Foldable.foldl(dictFoldable), affs);
      };
  };
  var killVar = function (q) {
      return function (e) {
          return Data_Function.apply(fromAVBox)(Control_Monad_Aff_Internal._killVar(nonCanceler, q, e));
      };
  };
  var makeAff = function (h) {
      return makeAff$prime(function (e) {
          return function (a) {
              return Data_Functor.map(Control_Monad_Eff.functorEff)(Data_Function["const"](nonCanceler))(h(e)(a));
          };
      });
  };
  var makeVar = Data_Function.apply(fromAVBox)(Control_Monad_Aff_Internal._makeVar(nonCanceler));
  var putVar = function (q) {
      return function (a) {
          return Data_Function.apply(fromAVBox)(Control_Monad_Aff_Internal._putVar(nonCanceler, q, a));
      };
  };
  var takeVar = function (q) {
      return Data_Function.apply(fromAVBox)(Control_Monad_Aff_Internal._takeVar(nonCanceler, q));
  };                                                                         
  var bindAff = new Control_Bind.Bind(function () {
      return applyAff;
  }, function (fa) {
      return function (f) {
          return $foreign._bind(alwaysCanceler, fa, f);
      };
  });
  var monadAff = new Control_Monad.Monad(function () {
      return applicativeAff;
  }, function () {
      return bindAff;
  });
  var monadEffAff = new Control_Monad_Eff_Class.MonadEff(function () {
      return monadAff;
  }, function (eff) {
      return $foreign._liftEff(nonCanceler, eff);
  });
  var monadRecAff = new Control_Monad_Rec_Class.MonadRec(function () {
      return monadAff;
  }, function (f) {
      return function (a) {
          return $foreign._tailRecM(Data_Either.isLeft, f, a);
      };
  });
  var monadErrorAff = new Control_Monad_Error_Class.MonadError(function () {
      return monadAff;
  }, function (aff) {
      return function (ex) {
          return Control_Bind.bind(bindAff)(attempt(aff))(Data_Either.either(ex)(Control_Applicative.pure(applicativeAff)));
      };
  }, function (e) {
      return $foreign._throwError(nonCanceler, e);
  });
  var monadParAff = new Control_Parallel_Class.MonadPar(function () {
      return monadAff;
  }, function (f) {
      return function (ma) {
          return function (mb) {
              var putOrKill = function (v) {
                  return Data_Either.either(killVar(v))(putVar(v));
              };
              return Control_Bind.bind(bindAff)(makeVar)(function (v) {
                  return Control_Bind.bind(bindAff)(makeVar)(function (v1) {
                      return Control_Bind.bind(bindAff)(forkAff(Control_Bind.bindFlipped(bindAff)(putOrKill(v))(attempt(ma))))(function (v2) {
                          return Control_Bind.bind(bindAff)(forkAff(Control_Bind.bindFlipped(bindAff)(putOrKill(v1))(attempt(mb))))(function (v3) {
                              return Control_Apply.apply(applyAff)(Data_Functor.map(functorAff)(f)(takeVar(v)))(takeVar(v1));
                          });
                      });
                  });
              });
          };
      };
  });
  exports["attempt"] = attempt;
  exports["forkAff"] = forkAff;
  exports["forkAll"] = forkAll;
  exports["makeAff"] = makeAff;
  exports["makeAff'"] = makeAff$prime;
  exports["nonCanceler"] = nonCanceler;
  exports["runAff"] = runAff;
  exports["functorAff"] = functorAff;
  exports["applyAff"] = applyAff;
  exports["applicativeAff"] = applicativeAff;
  exports["bindAff"] = bindAff;
  exports["monadAff"] = monadAff;
  exports["monadEffAff"] = monadEffAff;
  exports["monadErrorAff"] = monadErrorAff;
  exports["monadRecAff"] = monadRecAff;
  exports["monadParAff"] = monadParAff;
})(PS["Control.Monad.Aff"] = PS["Control.Monad.Aff"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Control_Monad_Aff = PS["Control.Monad.Aff"];
  var Control_Monad_Aff_Internal_1 = PS["Control.Monad.Aff.Internal"];
  var Control_Monad_Aff_Internal_1 = PS["Control.Monad.Aff.Internal"];
  var Control_Monad_Eff_Exception = PS["Control.Monad.Eff.Exception"];
  var Data_Function_Uncurried = PS["Data.Function.Uncurried"];
  var Unsafe_Coerce = PS["Unsafe.Coerce"];
  var Data_Function = PS["Data.Function"];
  var Control_Bind = PS["Control.Bind"];
  var Control_Applicative = PS["Control.Applicative"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];        
  var fromAVBox = Unsafe_Coerce.unsafeCoerce;
  var makeVar = Data_Function.apply(fromAVBox)(Control_Monad_Aff_Internal_1._makeVar(Control_Monad_Aff.nonCanceler));
  var putVar = function (q) {
      return function (a) {
          return Data_Function.apply(fromAVBox)(Control_Monad_Aff_Internal_1._putVar(Control_Monad_Aff.nonCanceler, q, a));
      };
  };
  var makeVar$prime = function (a) {
      return Control_Bind.bind(Control_Monad_Aff.bindAff)(makeVar)(function (v) {
          return Control_Bind.bind(Control_Monad_Aff.bindAff)(putVar(v)(a))(function () {
              return Control_Applicative.pure(Control_Monad_Aff.applicativeAff)(v);
          });
      });
  };
  var takeVar = function (q) {
      return Data_Function.apply(fromAVBox)(Control_Monad_Aff_Internal_1._takeVar(Control_Monad_Aff.nonCanceler, q));
  };
  var modifyVar = function (f) {
      return function (v) {
          return Control_Bind.bind(Control_Monad_Aff.bindAff)(takeVar(v))(function ($2) {
              return putVar(v)(f($2));
          });
      };
  };
  exports["makeVar"] = makeVar;
  exports["makeVar'"] = makeVar$prime;
  exports["modifyVar"] = modifyVar;
  exports["putVar"] = putVar;
  exports["takeVar"] = takeVar;
})(PS["Control.Monad.Aff.AVar"] = PS["Control.Monad.Aff.AVar"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var otherwise = true;
  exports["otherwise"] = otherwise;
})(PS["Data.Boolean"] = PS["Data.Boolean"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Control_Alt = PS["Control.Alt"];
  var Control_Alternative = PS["Control.Alternative"];
  var Control_Lazy = PS["Control.Lazy"];
  var Control_MonadPlus = PS["Control.MonadPlus"];
  var Control_MonadZero = PS["Control.MonadZero"];
  var Control_Plus = PS["Control.Plus"];
  var Data_Foldable = PS["Data.Foldable"];
  var Data_Generic = PS["Data.Generic"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Monoid = PS["Data.Monoid"];
  var Data_Traversable = PS["Data.Traversable"];
  var Data_Tuple = PS["Data.Tuple"];
  var Data_Unfoldable = PS["Data.Unfoldable"];
  var Control_Apply = PS["Control.Apply"];
  var Data_Unit = PS["Data.Unit"];
  var Data_Show = PS["Data.Show"];
  var Data_Semigroup = PS["Data.Semigroup"];
  var Data_Eq = PS["Data.Eq"];
  var Data_Function = PS["Data.Function"];
  var Data_HeytingAlgebra = PS["Data.HeytingAlgebra"];
  var Data_Ord = PS["Data.Ord"];
  var Data_Ordering = PS["Data.Ordering"];
  var Data_Functor = PS["Data.Functor"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Control_Applicative = PS["Control.Applicative"];
  var Control_Bind = PS["Control.Bind"];
  var Control_Monad = PS["Control.Monad"];
  var Data_Ring = PS["Data.Ring"];
  var Data_Boolean = PS["Data.Boolean"];
  var Data_Semiring = PS["Data.Semiring"];
  var Data_BooleanAlgebra = PS["Data.BooleanAlgebra"];
  var Control_Category = PS["Control.Category"];        
  var Nil = (function () {
      function Nil() {

      };
      Nil.value = new Nil();
      return Nil;
  })();
  var Cons = (function () {
      function Cons(value0, value1) {
          this.value0 = value0;
          this.value1 = value1;
      };
      Cons.create = function (value0) {
          return function (value1) {
              return new Cons(value0, value1);
          };
      };
      return Cons;
  })();
  var semigroupList = new Data_Semigroup.Semigroup(function (v) {
      return function (ys) {
          if (v instanceof Nil) {
              return ys;
          };
          if (v instanceof Cons) {
              return new Cons(v.value0, Data_Semigroup.append(semigroupList)(v.value1)(ys));
          };
          throw new Error("Failed pattern match at Data.List line 719, column 3 - line 719, column 21: " + [ v.constructor.name, ys.constructor.name ]);
      };
  });
  var reverse = (function () {
      var go = function (__copy_acc) {
          return function (__copy_v) {
              var acc = __copy_acc;
              var v = __copy_v;
              tco: while (true) {
                  if (v instanceof Nil) {
                      return acc;
                  };
                  if (v instanceof Cons) {
                      var __tco_acc = new Cons(v.value0, acc);
                      var __tco_v = v.value1;
                      acc = __tco_acc;
                      v = __tco_v;
                      continue tco;
                  };
                  throw new Error("Failed pattern match at Data.List line 346, column 1 - line 349, column 42: " + [ acc.constructor.name, v.constructor.name ]);
              };
          };
      };
      return go(Nil.value);
  })();
  var functorList = new Data_Functor.Functor(function (f) {
      return function (lst) {
          var go = function (v) {
              return function (acc) {
                  if (v instanceof Nil) {
                      return acc;
                  };
                  if (v instanceof Cons) {
                      return Data_Function.apply(go(v.value1))(new Cons(f(v.value0), acc));
                  };
                  throw new Error("Failed pattern match at Data.List line 726, column 3 - line 729, column 48: " + [ v.constructor.name, acc.constructor.name ]);
              };
          };
          return Data_Function.apply(reverse)(go(lst)(Nil.value));
      };
  });
  var fromFoldable = function (dictFoldable) {
      return Data_Foldable.foldr(dictFoldable)(Cons.create)(Nil.value);
  };
  var foldableList = new Data_Foldable.Foldable(function (dictMonoid) {
      return function (f) {
          return Data_Foldable.foldl(foldableList)(function (acc) {
              return function ($387) {
                  return Data_Semigroup.append(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(acc)(f($387));
              };
          })(Data_Monoid.mempty(dictMonoid));
      };
  }, (function () {
      var go = function (__copy_v) {
          return function (__copy_b) {
              return function (__copy_v1) {
                  var v = __copy_v;
                  var b = __copy_b;
                  var v1 = __copy_v1;
                  tco: while (true) {
                      if (v1 instanceof Nil) {
                          return b;
                      };
                      if (v1 instanceof Cons) {
                          var __tco_v = v;
                          var __tco_b = v(b)(v1.value0);
                          var __tco_v1 = v1.value1;
                          v = __tco_v;
                          b = __tco_b;
                          v1 = __tco_v1;
                          continue tco;
                      };
                      throw new Error("Failed pattern match at Data.List line 734, column 3 - line 737, column 49: " + [ v.constructor.name, b.constructor.name, v1.constructor.name ]);
                  };
              };
          };
      };
      return go;
  })(), function (v) {
      return function (b) {
          return function (v1) {
              if (v1 instanceof Nil) {
                  return b;
              };
              if (v1 instanceof Cons) {
                  return v(v1.value0)(Data_Foldable.foldr(foldableList)(v)(b)(v1.value1));
              };
              throw new Error("Failed pattern match at Data.List line 732, column 3 - line 732, column 20: " + [ v.constructor.name, b.constructor.name, v1.constructor.name ]);
          };
      };
  });                                                                        
  var applyList = new Control_Apply.Apply(function () {
      return functorList;
  }, function (v) {
      return function (v1) {
          if (v instanceof Nil) {
              return Nil.value;
          };
          if (v instanceof Cons) {
              return Data_Semigroup.append(semigroupList)(Data_Functor.map(functorList)(v.value0)(v1))(Control_Apply.apply(applyList)(v.value1)(v1));
          };
          throw new Error("Failed pattern match at Data.List line 754, column 3 - line 754, column 20: " + [ v.constructor.name, v1.constructor.name ]);
      };
  });
  var applicativeList = new Control_Applicative.Applicative(function () {
      return applyList;
  }, function (a) {
      return new Cons(a, Nil.value);
  });
  exports["Nil"] = Nil;
  exports["Cons"] = Cons;
  exports["fromFoldable"] = fromFoldable;
  exports["reverse"] = reverse;
  exports["semigroupList"] = semigroupList;
  exports["functorList"] = functorList;
  exports["foldableList"] = foldableList;
  exports["applyList"] = applyList;
  exports["applicativeList"] = applicativeList;
})(PS["Data.List"] = PS["Data.List"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Data_List = PS["Data.List"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Semigroup = PS["Data.Semigroup"];
  var Data_Show = PS["Data.Show"];
  var Data_Tuple = PS["Data.Tuple"];        
  var CatQueue = (function () {
      function CatQueue(value0, value1) {
          this.value0 = value0;
          this.value1 = value1;
      };
      CatQueue.create = function (value0) {
          return function (value1) {
              return new CatQueue(value0, value1);
          };
      };
      return CatQueue;
  })();
  var uncons = function (__copy_v) {
      var v = __copy_v;
      tco: while (true) {
          if (v.value0 instanceof Data_List.Nil && v.value1 instanceof Data_List.Nil) {
              return Data_Maybe.Nothing.value;
          };
          if (v.value0 instanceof Data_List.Nil) {
              var __tco_v = new CatQueue(Data_List.reverse(v.value1), Data_List.Nil.value);
              v = __tco_v;
              continue tco;
          };
          if (v.value0 instanceof Data_List.Cons) {
              return new Data_Maybe.Just(new Data_Tuple.Tuple(v.value0.value0, new CatQueue(v.value0.value1, v.value1)));
          };
          throw new Error("Failed pattern match at Data.CatQueue line 51, column 1 - line 51, column 36: " + [ v.constructor.name ]);
      };
  };
  var snoc = function (v) {
      return function (a) {
          return new CatQueue(v.value0, new Data_List.Cons(a, v.value1));
      };
  };
  var $$null = function (v) {
      if (v.value0 instanceof Data_List.Nil && v.value1 instanceof Data_List.Nil) {
          return true;
      };
      return false;
  };
  var empty = new CatQueue(Data_List.Nil.value, Data_List.Nil.value);
  exports["CatQueue"] = CatQueue;
  exports["empty"] = empty;
  exports["null"] = $$null;
  exports["snoc"] = snoc;
  exports["uncons"] = uncons;
})(PS["Data.CatQueue"] = PS["Data.CatQueue"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Data_CatQueue = PS["Data.CatQueue"];
  var Data_Foldable_1 = PS["Data.Foldable"];
  var Data_List = PS["Data.List"];
  var Control_Alt = PS["Control.Alt"];
  var Control_Alternative = PS["Control.Alternative"];
  var Control_Applicative = PS["Control.Applicative"];
  var Control_Apply = PS["Control.Apply"];
  var Control_Bind = PS["Control.Bind"];
  var Control_Monad = PS["Control.Monad"];
  var Control_MonadPlus = PS["Control.MonadPlus"];
  var Control_MonadZero = PS["Control.MonadZero"];
  var Control_Plus = PS["Control.Plus"];
  var Data_Foldable_1 = PS["Data.Foldable"];
  var Data_Function = PS["Data.Function"];
  var Data_Functor = PS["Data.Functor"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Monoid = PS["Data.Monoid"];
  var Data_NaturalTransformation = PS["Data.NaturalTransformation"];
  var Data_Semigroup = PS["Data.Semigroup"];
  var Data_Show = PS["Data.Show"];
  var Data_Traversable = PS["Data.Traversable"];
  var Data_Tuple = PS["Data.Tuple"];
  var Data_Unfoldable = PS["Data.Unfoldable"];        
  var CatNil = (function () {
      function CatNil() {

      };
      CatNil.value = new CatNil();
      return CatNil;
  })();
  var CatCons = (function () {
      function CatCons(value0, value1) {
          this.value0 = value0;
          this.value1 = value1;
      };
      CatCons.create = function (value0) {
          return function (value1) {
              return new CatCons(value0, value1);
          };
      };
      return CatCons;
  })();
  var link = function (v) {
      return function (cat) {
          if (v instanceof CatNil) {
              return cat;
          };
          if (v instanceof CatCons) {
              return new CatCons(v.value0, Data_CatQueue.snoc(v.value1)(cat));
          };
          throw new Error("Failed pattern match at Data.CatList line 111, column 1 - line 111, column 22: " + [ v.constructor.name, cat.constructor.name ]);
      };
  };
  var foldr = function (k) {
      return function (b) {
          return function (q) {
              var foldl = function (__copy_v) {
                  return function (__copy_c) {
                      return function (__copy_v1) {
                          var v = __copy_v;
                          var c = __copy_c;
                          var v1 = __copy_v1;
                          tco: while (true) {
                              if (v1 instanceof Data_List.Nil) {
                                  return c;
                              };
                              if (v1 instanceof Data_List.Cons) {
                                  var __tco_v = v;
                                  var __tco_c = v(c)(v1.value0);
                                  var __tco_v1 = v1.value1;
                                  v = __tco_v;
                                  c = __tco_c;
                                  v1 = __tco_v1;
                                  continue tco;
                              };
                              throw new Error("Failed pattern match at Data.CatList line 126, column 3 - line 126, column 22: " + [ v.constructor.name, c.constructor.name, v1.constructor.name ]);
                          };
                      };
                  };
              };
              var go = function (__copy_xs) {
                  return function (__copy_ys) {
                      var xs = __copy_xs;
                      var ys = __copy_ys;
                      tco: while (true) {
                          var $33 = Data_CatQueue.uncons(xs);
                          if ($33 instanceof Data_Maybe.Nothing) {
                              return foldl(function (x) {
                                  return function (i) {
                                      return i(x);
                                  };
                              })(b)(ys);
                          };
                          if ($33 instanceof Data_Maybe.Just) {
                              var __tco_ys = new Data_List.Cons(k($33.value0.value0), ys);
                              xs = $33.value0.value1;
                              ys = __tco_ys;
                              continue tco;
                          };
                          throw new Error("Failed pattern match at Data.CatList line 121, column 14 - line 123, column 67: " + [ $33.constructor.name ]);
                      };
                  };
              };
              return go(q)(Data_List.Nil.value);
          };
      };
  };
  var uncons = function (v) {
      if (v instanceof CatNil) {
          return Data_Maybe.Nothing.value;
      };
      if (v instanceof CatCons) {
          return new Data_Maybe.Just(new Data_Tuple.Tuple(v.value0, (function () {
              var $38 = Data_CatQueue["null"](v.value1);
              if ($38) {
                  return CatNil.value;
              };
              if (!$38) {
                  return foldr(link)(CatNil.value)(v.value1);
              };
              throw new Error("Failed pattern match at Data.CatList line 103, column 39 - line 103, column 89: " + [ $38.constructor.name ]);
          })()));
      };
      throw new Error("Failed pattern match at Data.CatList line 102, column 1 - line 102, column 24: " + [ v.constructor.name ]);
  }; 
  var empty = CatNil.value;
  var append = function (v) {
      return function (v1) {
          if (v1 instanceof CatNil) {
              return v;
          };
          if (v instanceof CatNil) {
              return v1;
          };
          return link(v)(v1);
      };
  }; 
  var semigroupCatList = new Data_Semigroup.Semigroup(append);
  var snoc = function (cat) {
      return function (a) {
          return append(cat)(new CatCons(a, Data_CatQueue.empty));
      };
  };
  exports["CatNil"] = CatNil;
  exports["CatCons"] = CatCons;
  exports["append"] = append;
  exports["empty"] = empty;
  exports["snoc"] = snoc;
  exports["uncons"] = uncons;
  exports["semigroupCatList"] = semigroupCatList;
})(PS["Data.CatList"] = PS["Data.CatList"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Control_Monad_Rec_Class = PS["Control.Monad.Rec.Class"];
  var Control_Monad_Trans = PS["Control.Monad.Trans"];
  var Data_CatList = PS["Data.CatList"];
  var Data_Either = PS["Data.Either"];
  var Data_Inject = PS["Data.Inject"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Tuple = PS["Data.Tuple"];
  var Unsafe_Coerce = PS["Unsafe.Coerce"];
  var Data_Functor = PS["Data.Functor"];
  var Control_Bind = PS["Control.Bind"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Control_Applicative = PS["Control.Applicative"];
  var Control_Apply = PS["Control.Apply"];
  var Control_Monad = PS["Control.Monad"];
  var Data_Semigroup = PS["Data.Semigroup"];
  var Free = (function () {
      function Free(value0, value1) {
          this.value0 = value0;
          this.value1 = value1;
      };
      Free.create = function (value0) {
          return function (value1) {
              return new Free(value0, value1);
          };
      };
      return Free;
  })();
  var Return = (function () {
      function Return(value0) {
          this.value0 = value0;
      };
      Return.create = function (value0) {
          return new Return(value0);
      };
      return Return;
  })();
  var Bind = (function () {
      function Bind(value0, value1) {
          this.value0 = value0;
          this.value1 = value1;
      };
      Bind.create = function (value0) {
          return function (value1) {
              return new Bind(value0, value1);
          };
      };
      return Bind;
  })();
  var toView = function (__copy_v) {
      var v = __copy_v;
      tco: while (true) {
          var runExpF = function (v2) {
              return v2;
          };
          var concatF = function (v2) {
              return function (r) {
                  return new Free(v2.value0, Data_Semigroup.append(Data_CatList.semigroupCatList)(v2.value1)(r));
              };
          };
          if (v.value0 instanceof Return) {
              var $20 = Data_CatList.uncons(v.value1);
              if ($20 instanceof Data_Maybe.Nothing) {
                  return new Return(Unsafe_Coerce.unsafeCoerce(v.value0.value0));
              };
              if ($20 instanceof Data_Maybe.Just) {
                  var __tco_v = Unsafe_Coerce.unsafeCoerce(concatF(runExpF($20.value0.value0)(v.value0.value0))($20.value0.value1));
                  v = __tco_v;
                  continue tco;
              };
              throw new Error("Failed pattern match at Control.Monad.Free line 171, column 7 - line 175, column 64: " + [ $20.constructor.name ]);
          };
          if (v.value0 instanceof Bind) {
              return new Bind(v.value0.value0, function (a) {
                  return Unsafe_Coerce.unsafeCoerce(concatF(v.value0.value1(a))(v.value1));
              });
          };
          throw new Error("Failed pattern match at Control.Monad.Free line 169, column 3 - line 177, column 56: " + [ v.value0.constructor.name ]);
      };
  };
  var runFreeM = function (dictFunctor) {
      return function (dictMonadRec) {
          return function (k) {
              var go = function (f) {
                  var $29 = toView(f);
                  if ($29 instanceof Return) {
                      return Data_Functor.map((((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Either.Right.create)(Control_Applicative.pure((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())($29.value0));
                  };
                  if ($29 instanceof Bind) {
                      return Data_Functor.map((((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Either.Left.create)(k(Data_Functor.map(dictFunctor)($29.value1)($29.value0)));
                  };
                  throw new Error("Failed pattern match at Control.Monad.Free line 147, column 10 - line 149, column 37: " + [ $29.constructor.name ]);
              };
              return Control_Monad_Rec_Class.tailRecM(dictMonadRec)(go);
          };
      };
  };
  var fromView = function (f) {
      return new Free(Unsafe_Coerce.unsafeCoerce(f), Data_CatList.empty);
  };
  var freeMonad = new Control_Monad.Monad(function () {
      return freeApplicative;
  }, function () {
      return freeBind;
  });
  var freeFunctor = new Data_Functor.Functor(function (k) {
      return function (f) {
          return Control_Bind.bindFlipped(freeBind)(function ($53) {
              return Control_Applicative.pure(freeApplicative)(k($53));
          })(f);
      };
  });
  var freeBind = new Control_Bind.Bind(function () {
      return freeApply;
  }, function (v) {
      return function (k) {
          return new Free(v.value0, Data_CatList.snoc(v.value1)(Unsafe_Coerce.unsafeCoerce(k)));
      };
  });
  var freeApply = new Control_Apply.Apply(function () {
      return freeFunctor;
  }, Control_Monad.ap(freeMonad));
  var freeApplicative = new Control_Applicative.Applicative(function () {
      return freeApply;
  }, function ($54) {
      return fromView(Return.create($54));
  });
  var freeMonadRec = new Control_Monad_Rec_Class.MonadRec(function () {
      return freeMonad;
  }, function (k) {
      return function (a) {
          return Control_Bind.bind(freeBind)(k(a))(Data_Either.either(Control_Monad_Rec_Class.tailRecM(freeMonadRec)(k))(Control_Applicative.pure(freeApplicative)));
      };
  });
  var liftF = function (f) {
      return fromView(new Bind(Unsafe_Coerce.unsafeCoerce(f), function ($55) {
          return Control_Applicative.pure(freeApplicative)(Unsafe_Coerce.unsafeCoerce($55));
      }));
  };
  var substFree = function (k) {
      var go = function (f) {
          var $45 = toView(f);
          if ($45 instanceof Return) {
              return Control_Applicative.pure(freeApplicative)($45.value0);
          };
          if ($45 instanceof Bind) {
              return Control_Bind.bind(freeBind)(k($45.value0))(Data_Functor.map(Data_Functor.functorFn)(go)($45.value1));
          };
          throw new Error("Failed pattern match at Control.Monad.Free line 122, column 10 - line 124, column 33: " + [ $45.constructor.name ]);
      };
      return go;
  };
  var hoistFree = function (k) {
      return substFree(function ($56) {
          return liftF(k($56));
      });
  };
  var foldFree = function (dictMonadRec) {
      return function (k) {
          var go = function (f) {
              var $49 = toView(f);
              if ($49 instanceof Return) {
                  return Data_Functor.map((((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Either.Right.create)(Control_Applicative.pure((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())($49.value0));
              };
              if ($49 instanceof Bind) {
                  return Data_Functor.map((((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(function ($57) {
                      return Data_Either.Left.create($49.value1($57));
                  })(k($49.value0));
              };
              throw new Error("Failed pattern match at Control.Monad.Free line 112, column 10 - line 114, column 37: " + [ $49.constructor.name ]);
          };
          return Control_Monad_Rec_Class.tailRecM(dictMonadRec)(go);
      };
  };
  exports["foldFree"] = foldFree;
  exports["hoistFree"] = hoistFree;
  exports["liftF"] = liftF;
  exports["runFreeM"] = runFreeM;
  exports["substFree"] = substFree;
  exports["freeFunctor"] = freeFunctor;
  exports["freeBind"] = freeBind;
  exports["freeApplicative"] = freeApplicative;
  exports["freeApply"] = freeApply;
  exports["freeMonad"] = freeMonad;
  exports["freeMonadRec"] = freeMonadRec;
})(PS["Control.Monad.Free"] = PS["Control.Monad.Free"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Control_Alt = PS["Control.Alt"];
  var Control_Alternative = PS["Control.Alternative"];
  var Control_Lazy = PS["Control.Lazy"];
  var Control_Monad_Cont_Class = PS["Control.Monad.Cont.Class"];
  var Control_Monad_Eff_Class = PS["Control.Monad.Eff.Class"];
  var Control_Monad_Error_Class = PS["Control.Monad.Error.Class"];
  var Control_Monad_Reader_Class = PS["Control.Monad.Reader.Class"];
  var Control_Monad_Rec_Class = PS["Control.Monad.Rec.Class"];
  var Control_Monad_State_Class = PS["Control.Monad.State.Class"];
  var Control_Monad_Trans = PS["Control.Monad.Trans"];
  var Control_Monad_Writer_Class = PS["Control.Monad.Writer.Class"];
  var Control_MonadPlus = PS["Control.MonadPlus"];
  var Control_MonadZero = PS["Control.MonadZero"];
  var Control_Plus = PS["Control.Plus"];
  var Data_Either = PS["Data.Either"];
  var Data_Tuple = PS["Data.Tuple"];
  var Data_Functor = PS["Data.Functor"];
  var Control_Apply = PS["Control.Apply"];
  var Control_Monad = PS["Control.Monad"];
  var Control_Applicative = PS["Control.Applicative"];
  var Data_Function = PS["Data.Function"];
  var Control_Bind = PS["Control.Bind"];
  var Data_Unit = PS["Data.Unit"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];        
  var StateT = function (x) {
      return x;
  }; 
  var functorStateT = function (dictFunctor) {
      return new Data_Functor.Functor(function (f) {
          return function (v) {
              return function (s) {
                  return Data_Functor.map(dictFunctor)(function (v1) {
                      return new Data_Tuple.Tuple(f(v1.value0), v1.value1);
                  })(v(s));
              };
          };
      });
  };
  var monadStateT = function (dictMonad) {
      return new Control_Monad.Monad(function () {
          return applicativeStateT(dictMonad);
      }, function () {
          return bindStateT(dictMonad);
      });
  };
  var bindStateT = function (dictMonad) {
      return new Control_Bind.Bind(function () {
          return applyStateT(dictMonad);
      }, function (v) {
          return function (f) {
              return function (s) {
                  return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(v(s))(function (v1) {
                      var $60 = f(v1.value0);
                      return $60(v1.value1);
                  });
              };
          };
      });
  };
  var applyStateT = function (dictMonad) {
      return new Control_Apply.Apply(function () {
          return functorStateT(((dictMonad["__superclass_Control.Bind.Bind_1"]())["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]());
      }, Control_Monad.ap(monadStateT(dictMonad)));
  };
  var applicativeStateT = function (dictMonad) {
      return new Control_Applicative.Applicative(function () {
          return applyStateT(dictMonad);
      }, function (a) {
          return function (s) {
              return Data_Function.apply(Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]()))(new Data_Tuple.Tuple(a, s));
          };
      });
  };
  var monadStateStateT = function (dictMonad) {
      return new Control_Monad_State_Class.MonadState(function () {
          return monadStateT(dictMonad);
      }, function (f) {
          return Data_Function.apply(StateT)(function ($95) {
              return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(f($95));
          });
      });
  };
  exports["StateT"] = StateT;
  exports["functorStateT"] = functorStateT;
  exports["applyStateT"] = applyStateT;
  exports["applicativeStateT"] = applicativeStateT;
  exports["bindStateT"] = bindStateT;
  exports["monadStateT"] = monadStateT;
  exports["monadStateStateT"] = monadStateStateT;
})(PS["Control.Monad.State.Trans"] = PS["Control.Monad.State.Trans"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Data_Either = PS["Data.Either"];
  var Data_Monoid = PS["Data.Monoid"];
  var Data_Tuple = PS["Data.Tuple"];
  var Control_Alt = PS["Control.Alt"];
  var Control_Alternative = PS["Control.Alternative"];
  var Control_Monad_Cont_Class = PS["Control.Monad.Cont.Class"];
  var Control_Monad_Eff_Class = PS["Control.Monad.Eff.Class"];
  var Control_Monad_Error_Class = PS["Control.Monad.Error.Class"];
  var Control_Monad_Reader_Class = PS["Control.Monad.Reader.Class"];
  var Control_Monad_Rec_Class = PS["Control.Monad.Rec.Class"];
  var Control_Monad_State_Class = PS["Control.Monad.State.Class"];
  var Control_Monad_Trans = PS["Control.Monad.Trans"];
  var Control_Monad_Writer_Class = PS["Control.Monad.Writer.Class"];
  var Control_MonadPlus = PS["Control.MonadPlus"];
  var Control_MonadZero = PS["Control.MonadZero"];
  var Control_Plus = PS["Control.Plus"];
  var Data_Functor = PS["Data.Functor"];
  var Data_Function = PS["Data.Function"];
  var Control_Apply = PS["Control.Apply"];
  var Data_Semigroup = PS["Data.Semigroup"];
  var Control_Applicative = PS["Control.Applicative"];
  var Control_Bind = PS["Control.Bind"];
  var Control_Monad = PS["Control.Monad"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];        
  var WriterT = function (x) {
      return x;
  };
  var runWriterT = function (v) {
      return v;
  };
  var mapWriterT = function (f) {
      return function (v) {
          return f(v);
      };
  };
  var functorWriterT = function (dictFunctor) {
      return new Data_Functor.Functor(function (f) {
          return Data_Function.apply(mapWriterT)(Data_Functor.map(dictFunctor)(function (v) {
              return new Data_Tuple.Tuple(f(v.value0), v.value1);
          }));
      });
  };
  var applyWriterT = function (dictSemigroup) {
      return function (dictApply) {
          return new Control_Apply.Apply(function () {
              return functorWriterT(dictApply["__superclass_Data.Functor.Functor_0"]());
          }, function (v) {
              return function (v1) {
                  var k = function (v3) {
                      return function (v4) {
                          return new Data_Tuple.Tuple(v3.value0(v4.value0), Data_Semigroup.append(dictSemigroup)(v3.value1)(v4.value1));
                      };
                  };
                  return Control_Apply.apply(dictApply)(Data_Functor.map(dictApply["__superclass_Data.Functor.Functor_0"]())(k)(v))(v1);
              };
          });
      };
  };
  var applicativeWriterT = function (dictMonoid) {
      return function (dictApplicative) {
          return new Control_Applicative.Applicative(function () {
              return applyWriterT(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(dictApplicative["__superclass_Control.Apply.Apply_0"]());
          }, function (a) {
              return Data_Function.apply(WriterT)(Data_Function.apply(Control_Applicative.pure(dictApplicative))(new Data_Tuple.Tuple(a, Data_Monoid.mempty(dictMonoid))));
          });
      };
  };
  exports["WriterT"] = WriterT;
  exports["mapWriterT"] = mapWriterT;
  exports["runWriterT"] = runWriterT;
  exports["functorWriterT"] = functorWriterT;
  exports["applyWriterT"] = applyWriterT;
  exports["applicativeWriterT"] = applicativeWriterT;
})(PS["Control.Monad.Writer.Trans"] = PS["Control.Monad.Writer.Trans"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Control_Monad_Aff = PS["Control.Monad.Aff"];
  var Control_Monad_Cont_Trans = PS["Control.Monad.Cont.Trans"];
  var Control_Monad_Eff = PS["Control.Monad.Eff"];
  var Control_Monad_Eff_Class = PS["Control.Monad.Eff.Class"];
  var Control_Monad_Except_Trans = PS["Control.Monad.Except.Trans"];
  var Control_Monad_Free = PS["Control.Monad.Free"];
  var Control_Monad_List_Trans = PS["Control.Monad.List.Trans"];
  var Control_Monad_Maybe_Trans = PS["Control.Monad.Maybe.Trans"];
  var Control_Monad_Reader_Trans = PS["Control.Monad.Reader.Trans"];
  var Control_Monad_RWS_Trans = PS["Control.Monad.RWS.Trans"];
  var Control_Monad_State_Trans = PS["Control.Monad.State.Trans"];
  var Control_Monad_Trans = PS["Control.Monad.Trans"];
  var Control_Monad_Writer_Trans = PS["Control.Monad.Writer.Trans"];
  var Data_Monoid = PS["Data.Monoid"];
  var Control_Category = PS["Control.Category"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];        
  var Affable = function (fromAff) {
      this.fromAff = fromAff;
  };
  var fromAff = function (dict) {
      return dict.fromAff;
  };
  var fromEff = function (dictAffable) {
      return function (eff) {
          return fromAff(dictAffable)(Control_Monad_Eff_Class.liftEff(Control_Monad_Aff.monadEffAff)(eff));
      };
  };
  var affableFree = function (dictAffable) {
      return new Affable(function ($28) {
          return Control_Monad_Free.liftF(fromAff(dictAffable)($28));
      });
  };
  var affableAff = new Affable(Control_Category.id(Control_Category.categoryFn));
  exports["Affable"] = Affable;
  exports["fromAff"] = fromAff;
  exports["fromEff"] = fromEff;
  exports["affableAff"] = affableAff;
  exports["affableFree"] = affableFree;
})(PS["Control.Monad.Aff.Free"] = PS["Control.Monad.Aff.Free"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Control_Monad_State_Class = PS["Control.Monad.State.Class"];
  var Control_Monad_State_Trans = PS["Control.Monad.State.Trans"];
  var Data_Identity = PS["Data.Identity"];
  var Data_Tuple = PS["Data.Tuple"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var runState = function (v) {
      return function ($14) {
          return Data_Identity.runIdentity(v($14));
      };
  };
  exports["runState"] = runState;
})(PS["Control.Monad.State"] = PS["Control.Monad.State"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Control_Monad_Writer_Class = PS["Control.Monad.Writer.Class"];
  var Control_Monad_Writer_Trans = PS["Control.Monad.Writer.Trans"];
  var Data_Identity = PS["Data.Identity"];
  var Data_Tuple = PS["Data.Tuple"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];        
  var runWriter = function ($0) {
      return Data_Identity.runIdentity(Control_Monad_Writer_Trans.runWriterT($0));
  };
  exports["runWriter"] = runWriter;
})(PS["Control.Monad.Writer"] = PS["Control.Monad.Writer"] || {});
(function(exports) {
    "use strict";

  exports.eventListener = function (fn) {
    return function (event) {
      return fn(event)();
    };
  };

  exports.addEventListener = function (type) {
    return function (listener) {
      return function (useCapture) {
        return function (target) {
          return function () {
            target.addEventListener(type, listener, useCapture);
            return {};
          };
        };
      };
    };
  };
})(PS["DOM.Event.EventTarget"] = PS["DOM.Event.EventTarget"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["DOM.Event.EventTarget"];
  var Prelude = PS["Prelude"];
  var Control_Monad_Eff = PS["Control.Monad.Eff"];
  var Control_Monad_Eff_Exception = PS["Control.Monad.Eff.Exception"];
  var DOM = PS["DOM"];
  var DOM_Event_Types = PS["DOM.Event.Types"];
  exports["addEventListener"] = $foreign.addEventListener;
  exports["eventListener"] = $foreign.eventListener;
})(PS["DOM.Event.EventTarget"] = PS["DOM.Event.EventTarget"] || {});
(function(exports) {
  /* global window */
  "use strict";

  exports.window = function () {
    return window;
  };
})(PS["DOM.HTML"] = PS["DOM.HTML"] || {});
(function(exports) {
    "use strict";

  exports._readHTMLElement = function (failure) {
    return function (success) {
      return function (value) {
        var tag = Object.prototype.toString.call(value);
        if (tag.indexOf("[object HTML") === 0 && tag.indexOf("Element]") === tag.length - 8) {
          return success(value);
        } else {
          return failure(tag);
        }
      };
    };
  };
})(PS["DOM.HTML.Types"] = PS["DOM.HTML.Types"] || {});
(function(exports) {
  /* global exports */
  "use strict";

  // jshint maxparams: 3
  exports.parseJSONImpl = function (left, right, str) {
    try {
      return right(JSON.parse(str));
    } catch (e) {
      return left(e.toString());
    }
  };
  // jshint maxparams: 1

  exports.toForeign = function (value) {
    return value;
  };

  exports.unsafeFromForeign = function (value) {
    return value;
  };

  exports.typeOf = function (value) {
    return typeof value;
  };

  exports.tagOf = function (value) {
    return Object.prototype.toString.call(value).slice(8, -1);
  };

  exports.isNull = function (value) {
    return value === null;
  };

  exports.isUndefined = function (value) {
    return value === undefined;
  };
})(PS["Data.Foreign"] = PS["Data.Foreign"] || {});
(function(exports) {
    "use strict";

  // module Data.Int

  exports.fromNumberImpl = function (just) {
    return function (nothing) {
      return function (n) {
        /* jshint bitwise: false */
        return (n | 0) === n ? just(n) : nothing;
      };
    };
  };
})(PS["Data.Int"] = PS["Data.Int"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Data.Int"];
  var Data_Boolean = PS["Data.Boolean"];
  var Data_BooleanAlgebra = PS["Data.BooleanAlgebra"];
  var Data_Bounded = PS["Data.Bounded"];
  var Data_Eq = PS["Data.Eq"];
  var Data_Function = PS["Data.Function"];
  var Data_Int_Bits = PS["Data.Int.Bits"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Ord = PS["Data.Ord"];
  var $$Math = PS["Math"];
  var Partial_Unsafe = PS["Partial.Unsafe"];
  var Data_HeytingAlgebra = PS["Data.HeytingAlgebra"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var fromNumber = $foreign.fromNumberImpl(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
  exports["fromNumber"] = fromNumber;
})(PS["Data.Int"] = PS["Data.Int"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Data.Foreign"];
  var Prelude = PS["Prelude"];
  var Data_Either = PS["Data.Either"];
  var Data_Function_Uncurried = PS["Data.Function.Uncurried"];
  var Data_Int = PS["Data.Int"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_String = PS["Data.String"];
  var Data_Show = PS["Data.Show"];
  var Data_Semigroup = PS["Data.Semigroup"];
  var Data_Eq = PS["Data.Eq"];
  var Data_HeytingAlgebra = PS["Data.HeytingAlgebra"];
  var Data_Ord = PS["Data.Ord"];
  var Data_Ordering = PS["Data.Ordering"];
  var Control_Applicative = PS["Control.Applicative"];
  var Data_Function = PS["Data.Function"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var TypeMismatch = (function () {
      function TypeMismatch(value0, value1) {
          this.value0 = value0;
          this.value1 = value1;
      };
      TypeMismatch.create = function (value0) {
          return function (value1) {
              return new TypeMismatch(value0, value1);
          };
      };
      return TypeMismatch;
  })();
  var ErrorAtIndex = (function () {
      function ErrorAtIndex(value0, value1) {
          this.value0 = value0;
          this.value1 = value1;
      };
      ErrorAtIndex.create = function (value0) {
          return function (value1) {
              return new ErrorAtIndex(value0, value1);
          };
      };
      return ErrorAtIndex;
  })();
  var ErrorAtProperty = (function () {
      function ErrorAtProperty(value0, value1) {
          this.value0 = value0;
          this.value1 = value1;
      };
      ErrorAtProperty.create = function (value0) {
          return function (value1) {
              return new ErrorAtProperty(value0, value1);
          };
      };
      return ErrorAtProperty;
  })();
  var JSONError = (function () {
      function JSONError(value0) {
          this.value0 = value0;
      };
      JSONError.create = function (value0) {
          return new JSONError(value0);
      };
      return JSONError;
  })();
  var unsafeReadTagged = function (tag) {
      return function (value) {
          if ($foreign.tagOf(value) === tag) {
              return Control_Applicative.pure(Data_Either.applicativeEither)($foreign.unsafeFromForeign(value));
          };
          return new Data_Either.Left(new TypeMismatch(tag, $foreign.tagOf(value)));
      };
  };
  var showForeignError = new Data_Show.Show(function (v) {
      if (v instanceof TypeMismatch) {
          return "Type mismatch: expected " + (v.value0 + (", found " + v.value1));
      };
      if (v instanceof ErrorAtIndex) {
          return "Error at array index " + (Data_Show.show(Data_Show.showInt)(v.value0) + (": " + Data_Show.show(showForeignError)(v.value1)));
      };
      if (v instanceof ErrorAtProperty) {
          return "Error at property " + (Data_Show.show(Data_Show.showString)(v.value0) + (": " + Data_Show.show(showForeignError)(v.value1)));
      };
      if (v instanceof JSONError) {
          return "JSON error: " + v.value0;
      };
      throw new Error("Failed pattern match at Data.Foreign line 55, column 3 - line 55, column 87: " + [ v.constructor.name ]);
  });
  var readString = unsafeReadTagged("String");
  var parseJSON = function (json) {
      return $foreign.parseJSONImpl(function ($93) {
          return Data_Either.Left.create(JSONError.create($93));
      }, Data_Either.Right.create, json);
  };
  exports["TypeMismatch"] = TypeMismatch;
  exports["ErrorAtIndex"] = ErrorAtIndex;
  exports["ErrorAtProperty"] = ErrorAtProperty;
  exports["JSONError"] = JSONError;
  exports["parseJSON"] = parseJSON;
  exports["readString"] = readString;
  exports["unsafeReadTagged"] = unsafeReadTagged;
  exports["showForeignError"] = showForeignError;
  exports["isNull"] = $foreign.isNull;
  exports["isUndefined"] = $foreign.isUndefined;
  exports["toForeign"] = $foreign.toForeign;
  exports["typeOf"] = $foreign.typeOf;
})(PS["Data.Foreign"] = PS["Data.Foreign"] || {});
(function(exports) {
  /* global exports */
  "use strict";

  //------------------------------------------------------------------------------
  // Array size ------------------------------------------------------------------
  //------------------------------------------------------------------------------

  exports.length = function (xs) {
    return xs.length;
  };

  //------------------------------------------------------------------------------
  // Extending arrays ------------------------------------------------------------
  //------------------------------------------------------------------------------

  exports.cons = function (e) {
    return function (l) {
      return [e].concat(l);
    };
  };

  exports.snoc = function (l) {
    return function (e) {
      var l1 = l.slice();
      l1.push(e);
      return l1;
    };
  };

  exports.concat = function (xss) {
    var result = [];
    for (var i = 0, l = xss.length; i < l; i++) {
      var xs = xss[i];
      for (var j = 0, m = xs.length; j < m; j++) {
        result.push(xs[j]);
      }
    }
    return result;
  };

  exports.filter = function (f) {
    return function (xs) {
      return xs.filter(f);
    };
  };

  //------------------------------------------------------------------------------
  // Subarrays -------------------------------------------------------------------
  //------------------------------------------------------------------------------

  exports.slice = function (s) {
    return function (e) {
      return function (l) {
        return l.slice(s, e);
      };
    };
  };
})(PS["Data.Array"] = PS["Data.Array"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Data.Array"];
  var Prelude = PS["Prelude"];
  var Control_Alt = PS["Control.Alt"];
  var Control_Alternative = PS["Control.Alternative"];
  var Control_Lazy = PS["Control.Lazy"];
  var Data_Foldable = PS["Data.Foldable"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Traversable = PS["Data.Traversable"];
  var Data_Tuple = PS["Data.Tuple"];
  var Data_Unfoldable = PS["Data.Unfoldable"];
  var Partial_Unsafe = PS["Partial.Unsafe"];
  var Data_Function = PS["Data.Function"];
  var Data_Ordering = PS["Data.Ordering"];
  var Data_Ring = PS["Data.Ring"];
  var Data_Ord = PS["Data.Ord"];
  var Data_Eq = PS["Data.Eq"];
  var Data_HeytingAlgebra = PS["Data.HeytingAlgebra"];
  var Control_Apply = PS["Control.Apply"];
  var Data_Functor = PS["Data.Functor"];
  var Control_Applicative = PS["Control.Applicative"];
  var Data_Boolean = PS["Data.Boolean"];
  var Data_Semiring = PS["Data.Semiring"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Control_Bind = PS["Control.Bind"];
  var Data_Semigroup = PS["Data.Semigroup"];
  var Control_Category = PS["Control.Category"];
  exports["cons"] = $foreign.cons;
  exports["filter"] = $foreign.filter;
  exports["snoc"] = $foreign.snoc;
})(PS["Data.Array"] = PS["Data.Array"] || {});
(function(exports) {
  /* global exports */
  "use strict";

  // jshint maxparams: 4
  exports.unsafeReadPropImpl = function (f, s, key, value) {
    return value == null ? f : s(value[key]);
  };

  // jshint maxparams: 2
  exports.unsafeHasOwnProperty = function (prop, value) {
    return Object.prototype.hasOwnProperty.call(value, prop);
  };

  exports.unsafeHasProperty = function (prop, value) {
    return prop in value;
  };
})(PS["Data.Foreign.Index"] = PS["Data.Foreign.Index"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Data.Foreign.Index"];
  var Prelude = PS["Prelude"];
  var Data_Either = PS["Data.Either"];
  var Data_Foreign = PS["Data.Foreign"];
  var Data_Function_Uncurried = PS["Data.Function.Uncurried"];
  var Data_Function = PS["Data.Function"];
  var Control_Applicative = PS["Control.Applicative"];
  var Data_HeytingAlgebra = PS["Data.HeytingAlgebra"];
  var Data_Eq = PS["Data.Eq"];        
  var Index = function (errorAt, hasOwnProperty, hasProperty, ix) {
      this.errorAt = errorAt;
      this.hasOwnProperty = hasOwnProperty;
      this.hasProperty = hasProperty;
      this.ix = ix;
  };
  var unsafeReadProp = function (k) {
      return function (value) {
          return $foreign.unsafeReadPropImpl(new Data_Either.Left(new Data_Foreign.TypeMismatch("object", Data_Foreign.typeOf(value))), Control_Applicative.pure(Data_Either.applicativeEither), k, value);
      };
  };
  var prop = unsafeReadProp;
  var ix = function (dict) {
      return dict.ix;
  };                         
  var hasPropertyImpl = function (v) {
      return function (value) {
          if (Data_Foreign.isNull(value)) {
              return false;
          };
          if (Data_Foreign.isUndefined(value)) {
              return false;
          };
          if (Data_Foreign.typeOf(value) === "object" || Data_Foreign.typeOf(value) === "function") {
              return $foreign.unsafeHasProperty(v, value);
          };
          return false;
      };
  };
  var hasProperty = function (dict) {
      return dict.hasProperty;
  };
  var hasOwnPropertyImpl = function (v) {
      return function (value) {
          if (Data_Foreign.isNull(value)) {
              return false;
          };
          if (Data_Foreign.isUndefined(value)) {
              return false;
          };
          if (Data_Foreign.typeOf(value) === "object" || Data_Foreign.typeOf(value) === "function") {
              return $foreign.unsafeHasOwnProperty(v, value);
          };
          return false;
      };
  };                                                                                                                         
  var indexString = new Index(Data_Foreign.ErrorAtProperty.create, hasOwnPropertyImpl, hasPropertyImpl, Data_Function.flip(prop));
  var hasOwnProperty = function (dict) {
      return dict.hasOwnProperty;
  };
  var errorAt = function (dict) {
      return dict.errorAt;
  };
  exports["Index"] = Index;
  exports["errorAt"] = errorAt;
  exports["hasOwnProperty"] = hasOwnProperty;
  exports["hasProperty"] = hasProperty;
  exports["ix"] = ix;
  exports["prop"] = prop;
  exports["indexString"] = indexString;
})(PS["Data.Foreign.Index"] = PS["Data.Foreign.Index"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Data_Array = PS["Data.Array"];
  var Data_Either = PS["Data.Either"];
  var Data_Foreign = PS["Data.Foreign"];
  var Data_Foreign_Index = PS["Data.Foreign.Index"];
  var Data_Foreign_Null = PS["Data.Foreign.Null"];
  var Data_Foreign_NullOrUndefined = PS["Data.Foreign.NullOrUndefined"];
  var Data_Foreign_Undefined = PS["Data.Foreign.Undefined"];
  var Data_Traversable = PS["Data.Traversable"];
  var Data_Maybe = PS["Data.Maybe"];
  var Control_Applicative = PS["Control.Applicative"];
  var Data_Semiring = PS["Data.Semiring"];
  var Control_Bind = PS["Control.Bind"];
  var Control_Category = PS["Control.Category"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Data_Functor = PS["Data.Functor"];        
  var IsForeign = function (read) {
      this.read = read;
  };
  var stringIsForeign = new IsForeign(Data_Foreign.readString);
  var read = function (dict) {
      return dict.read;
  };
  var readWith = function (dictIsForeign) {
      return function (f) {
          return function (value) {
              return Data_Either.either(function ($19) {
                  return Data_Either.Left.create(f($19));
              })(Data_Either.Right.create)(read(dictIsForeign)(value));
          };
      };
  };
  var readProp = function (dictIsForeign) {
      return function (dictIndex) {
          return function (prop) {
              return function (value) {
                  return Control_Bind.bind(Data_Either.bindEither)(Data_Foreign_Index.ix(dictIndex)(value)(prop))(readWith(dictIsForeign)(Data_Foreign_Index.errorAt(dictIndex)(prop)));
              };
          };
      };
  };
  exports["IsForeign"] = IsForeign;
  exports["read"] = read;
  exports["readProp"] = readProp;
  exports["readWith"] = readWith;
  exports["stringIsForeign"] = stringIsForeign;
})(PS["Data.Foreign.Class"] = PS["Data.Foreign.Class"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["DOM.HTML.Types"];
  var Prelude = PS["Prelude"];
  var Data_Either = PS["Data.Either"];
  var Data_Foreign = PS["Data.Foreign"];
  var Data_Foreign_Class = PS["Data.Foreign.Class"];
  var DOM_Event_Types = PS["DOM.Event.Types"];
  var DOM_Node_Types = PS["DOM.Node.Types"];
  var Unsafe_Coerce = PS["Unsafe.Coerce"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];        
  var windowToEventTarget = Unsafe_Coerce.unsafeCoerce;                        
  var readHTMLElement = $foreign._readHTMLElement(function ($0) {
      return Data_Either.Left.create(Data_Foreign.TypeMismatch.create("HTMLElement")($0));
  })(Data_Either.Right.create);                                          
  var htmlElementToNode = Unsafe_Coerce.unsafeCoerce;   
  var htmlDocumentToParentNode = Unsafe_Coerce.unsafeCoerce;
  exports["htmlDocumentToParentNode"] = htmlDocumentToParentNode;
  exports["htmlElementToNode"] = htmlElementToNode;
  exports["readHTMLElement"] = readHTMLElement;
  exports["windowToEventTarget"] = windowToEventTarget;
})(PS["DOM.HTML.Types"] = PS["DOM.HTML.Types"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["DOM.HTML"];
  var Control_Monad_Eff = PS["Control.Monad.Eff"];
  var DOM = PS["DOM"];
  var DOM_HTML_Types = PS["DOM.HTML.Types"];
  exports["window"] = $foreign.window;
})(PS["DOM.HTML"] = PS["DOM.HTML"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var DOM_Event_Types = PS["DOM.Event.Types"];
  var load = "load";
  exports["load"] = load;
})(PS["DOM.HTML.Event.EventTypes"] = PS["DOM.HTML.Event.EventTypes"] || {});
(function(exports) {
    "use strict";

  exports.document = function (window) {
    return function () {
      return window.document;
    };
  };
})(PS["DOM.HTML.Window"] = PS["DOM.HTML.Window"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["DOM.HTML.Window"];
  var Control_Monad_Eff = PS["Control.Monad.Eff"];
  var DOM = PS["DOM"];
  var DOM_HTML_Types = PS["DOM.HTML.Types"];
  exports["document"] = $foreign.document;
})(PS["DOM.HTML.Window"] = PS["DOM.HTML.Window"] || {});
(function(exports) {
    "use strict";

  exports.appendChild = function (node) {
    return function (parent) {
      return function () {
        return parent.appendChild(node);
      };
    };
  };
})(PS["DOM.Node.Node"] = PS["DOM.Node.Node"] || {});
(function(exports) {
  /* global exports */
  "use strict";

  exports["null"] = null;

  exports.nullable = function(a, r, f) {
      return a == null ? r : f(a);
  };

  exports.notNull = function(x) {
      return x;
  };
})(PS["Data.Nullable"] = PS["Data.Nullable"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Data.Nullable"];
  var Prelude = PS["Prelude"];
  var Data_Function = PS["Data.Function"];
  var Data_Function_Uncurried = PS["Data.Function.Uncurried"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Show = PS["Data.Show"];
  var Data_Eq = PS["Data.Eq"];
  var Data_Ord = PS["Data.Ord"];        
  var toNullable = Data_Maybe.maybe($foreign["null"])($foreign.notNull);
  var toMaybe = function (n) {
      return $foreign.nullable(n, Data_Maybe.Nothing.value, Data_Maybe.Just.create);
  };
  exports["toMaybe"] = toMaybe;
  exports["toNullable"] = toNullable;
})(PS["Data.Nullable"] = PS["Data.Nullable"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["DOM.Node.Node"];
  var Prelude = PS["Prelude"];
  var Control_Monad_Eff = PS["Control.Monad.Eff"];
  var Data_Enum = PS["Data.Enum"];
  var Data_Nullable = PS["Data.Nullable"];
  var Data_Maybe = PS["Data.Maybe"];
  var DOM = PS["DOM"];
  var DOM_Node_NodeType = PS["DOM.Node.NodeType"];
  var DOM_Node_Types = PS["DOM.Node.Types"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  exports["appendChild"] = $foreign.appendChild;
})(PS["DOM.Node.Node"] = PS["DOM.Node.Node"] || {});
(function(exports) {
    "use strict";                                             

  exports.querySelector = function (selector) {
    return function (node) {
      return function () {
        return node.querySelector(selector);
      };
    };
  };
})(PS["DOM.Node.ParentNode"] = PS["DOM.Node.ParentNode"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["DOM.Node.ParentNode"];
  var Control_Monad_Eff = PS["Control.Monad.Eff"];
  var Data_Nullable = PS["Data.Nullable"];
  var DOM = PS["DOM"];
  var DOM_Node_Types = PS["DOM.Node.Types"];
  exports["querySelector"] = $foreign.querySelector;
})(PS["DOM.Node.ParentNode"] = PS["DOM.Node.ParentNode"] || {});
(function(exports) {// module Data.Argonaut.Core

  function id(x) {
      return x;
  }                       
  exports.fromString = id;
  exports.fromObject = id;

  exports.stringify = function(j) {
      return JSON.stringify(j);
  };

  exports._foldJson = function(isNull, isBool, isNum, isStr, isArr, isObj, j) {
      if (j == null) return isNull(null);
      else if (typeof j === 'boolean') return isBool(j);
      else if (typeof j === 'number') return isNum(j);
      else if (typeof j === 'string') return isStr(j);
      else if (Object.prototype.toString.call(j) === '[object Array]')
          return isArr(j);
      else return isObj(j);
  };

  function _compare(EQ, GT, LT, a, b) {
      function isArray(a) {
          return Object.prototype.toString.call(a) === '[object Array]';
      }
      function keys(o) {
          var a = [];
          for (var k in o) {
              a.push(k);
          }
          return a;
      }

      if (a == null) {
          if (b == null) return EQ;
          else return LT;
      } else if (typeof a === 'boolean') {
          if (typeof b === 'boolean') {
              // boolean / boolean
              if (a === b) return EQ;
              else if (a == false) return LT;
              else return GT;
          } else if (b == null) return GT;
          else return LT;
      } else if (typeof a === 'number') {
          if (typeof b === 'number') {
              if (a === b) return EQ;
              else if (a < b) return LT;
              else return GT;
          } else if (b == null) return GT;
          else if (typeof b === 'boolean') return GT;
          else return LT;
      } else if (typeof a === 'string') {
          if (typeof b === 'string') {
              if (a === b) return EQ;
              else if (a < b) return LT;
              else return GT;
          } else if (b == null) return GT;
          else if (typeof b === 'boolean') return GT;
          else if (typeof b === 'number') return GT;
          else return LT;
      } else if (isArray(a)) {
          if (isArray(b)) {
              for (var i = 0; i < Math.min(a.length, b.length); i++) {
                  var c = _compare(EQ, GT, LT, a[i], b[i]);
                
                  if (c !== EQ) return c;
              }
              if (a.length === b.length) return EQ;
              else if (a.length < b.length) return LT;
              else return GT;
          } else if (b == null) return GT;
          else if (typeof b === 'boolean') return GT;
          else if (typeof b === 'number') return GT;
          else if (typeof b === 'string') return GT;
          else return LT;
      }
      else {
          if (b == null) return GT;
          else if (typeof b === 'boolean') return GT;
          else if (typeof b === 'number') return GT;
          else if (typeof b === 'string') return GT;
          else if (isArray(b)) return GT;
          else {
              var akeys = keys(a);
              var bkeys = keys(b);
            
              var keys = akeys.concat(bkeys).sort();
            
              for (var i = 0; i < keys.length; i++) {
                  var k = keys[i];
                
                  if (a[k] === undefined) return LT;
                  else if (b[k] === undefined) return GT;
                
                  var c = _compare(EQ, GT, LT, a[k], b[k]);
                
                  if (c !== EQ) return c;
              }
            
              if (akeys.length === bkeys.length) return EQ;
              else if (akeys.length < bkeys.length) return LT;
              else return GT;
          }
      }
  };
})(PS["Data.Argonaut.Core"] = PS["Data.Argonaut.Core"] || {});
(function(exports) {
  /* global exports */
  "use strict";

  exports._copyEff = function (m) {
    return function () {
      var r = {};
      for (var k in m) {
        if (m.hasOwnProperty(k)) {
          r[k] = m[k];
        }
      }
      return r;
    };
  };

  exports.empty = {};

  exports.runST = function (f) {
    return f;
  };

  // jshint maxparams: 2
  exports._fmapStrMap = function (m0, f) {
    var m = {};
    for (var k in m0) {
      if (m0.hasOwnProperty(k)) {
        m[k] = f(m0[k]);
      }
    }
    return m;
  };

  // jshint maxparams: 1
  exports._foldM = function (bind) {
    return function (f) {
      return function (mz) {
        return function (m) {
          var acc = mz;
          function g(k) {
            return function (z) {
              return f(z)(k)(m[k]);
            };
          }
          for (var k in m) {
            if (m.hasOwnProperty(k)) {
              acc = bind(acc)(g(k));
            }
          }
          return acc;
        };
      };
    };
  };

  // jshint maxparams: 4
  exports._lookup = function (no, yes, k, m) {
    return k in m ? yes(m[k]) : no;
  };

  function _collect(f) {
    return function (m) {
      var r = [];
      for (var k in m) {
        if (m.hasOwnProperty(k)) {
          r.push(f(k)(m[k]));
        }
      }
      return r;
    };
  }

  exports._collect = _collect;
})(PS["Data.StrMap"] = PS["Data.StrMap"] || {});
(function(exports) {
  /* global exports */
  "use strict";

  // module Data.StrMap.ST

  exports["new"] = function () {
    return {};
  };

  exports.poke = function (m) {
    return function (k) {
      return function (v) {
        return function () {
          m[k] = v;
          return m;
        };
      };
    };
  };
})(PS["Data.StrMap.ST"] = PS["Data.StrMap.ST"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Data.StrMap.ST"];
  var Control_Monad_Eff = PS["Control.Monad.Eff"];
  var Control_Monad_ST = PS["Control.Monad.ST"];
  var Data_Maybe = PS["Data.Maybe"];
  exports["new"] = $foreign["new"];
  exports["poke"] = $foreign.poke;
})(PS["Data.StrMap.ST"] = PS["Data.StrMap.ST"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Data.StrMap"];
  var Prelude = PS["Prelude"];
  var Control_Monad_Eff = PS["Control.Monad.Eff"];
  var Control_Monad_ST = PS["Control.Monad.ST"];
  var Data_Foldable = PS["Data.Foldable"];
  var Data_Function_Uncurried = PS["Data.Function.Uncurried"];
  var Data_List = PS["Data.List"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Monoid = PS["Data.Monoid"];
  var Data_StrMap_ST = PS["Data.StrMap.ST"];
  var Data_Traversable = PS["Data.Traversable"];
  var Data_Tuple = PS["Data.Tuple"];
  var Data_Functor = PS["Data.Functor"];
  var Data_Function = PS["Data.Function"];
  var Control_Apply = PS["Control.Apply"];
  var Control_Applicative = PS["Control.Applicative"];
  var Control_Category = PS["Control.Category"];
  var Data_Eq = PS["Data.Eq"];
  var Data_HeytingAlgebra = PS["Data.HeytingAlgebra"];
  var Data_Show = PS["Data.Show"];
  var Data_Semigroup = PS["Data.Semigroup"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Control_Bind = PS["Control.Bind"];        
  var values = function ($38) {
      return Data_List.fromFoldable(Data_Foldable.foldableArray)($foreign._collect(function (v) {
          return function (v1) {
              return v1;
          };
      })($38));
  };
  var toList = function ($39) {
      return Data_List.fromFoldable(Data_Foldable.foldableArray)($foreign._collect(Data_Tuple.Tuple.create)($39));
  };
  var thawST = $foreign._copyEff;
  var pureST = function (f) {
      return Control_Monad_Eff.runPure($foreign.runST(f));
  };
  var singleton = function (k) {
      return function (v) {
          return pureST(function __do() {
              var v1 = Data_StrMap_ST["new"]();
              Data_StrMap_ST.poke(v1)(k)(v)();
              return v1;
          });
      };
  };
  var mutate = function (f) {
      return function (m) {
          return pureST(function __do() {
              var v = thawST(m)();
              f(v)();
              return v;
          });
      };
  };                                                                                                 
  var lookup = Data_Function_Uncurried.runFn4($foreign._lookup)(Data_Maybe.Nothing.value)(Data_Maybe.Just.create);
  var insert = function (k) {
      return function (v) {
          return mutate(function (s) {
              return Data_StrMap_ST.poke(s)(k)(v);
          });
      };
  };
  var functorStrMap = new Data_Functor.Functor(function (f) {
      return function (m) {
          return $foreign._fmapStrMap(m, f);
      };
  });                                                         
  var fromFoldable = function (dictFoldable) {
      return function (l) {
          return pureST(function __do() {
              var v = Data_StrMap_ST["new"]();
              Data_Foldable.for_(Control_Monad_Eff.applicativeEff)(dictFoldable)(l)(function (v1) {
                  return Data_StrMap_ST.poke(v)(v1.value0)(v1.value1);
              })();
              return v;
          });
      };
  };
  var foldM = function (dictMonad) {
      return function (f) {
          return function (z) {
              return $foreign._foldM(Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]()))(f)(Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(z));
          };
      };
  };
  var union = function (m) {
      return mutate(function (s) {
          return foldM(Control_Monad_Eff.monadEff)(Data_StrMap_ST.poke)(s)(m);
      });
  };                                                                              
  var fold = $foreign._foldM(Data_Function.applyFlipped);
  var foldMap = function (dictMonoid) {
      return function (f) {
          return fold(function (acc) {
              return function (k) {
                  return function (v) {
                      return Data_Semigroup.append(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(acc)(f(k)(v));
                  };
              };
          })(Data_Monoid.mempty(dictMonoid));
      };
  };
  var foldableStrMap = new Data_Foldable.Foldable(function (dictMonoid) {
      return function (f) {
          return foldMap(dictMonoid)(Data_Function["const"](f));
      };
  }, function (f) {
      return fold(function (z) {
          return function (v) {
              return f(z);
          };
      });
  }, function (f) {
      return function (z) {
          return function (m) {
              return Data_Foldable.foldr(Data_List.foldableList)(f)(z)(values(m));
          };
      };
  });
  var traversableStrMap = new Data_Traversable.Traversable(function () {
      return foldableStrMap;
  }, function () {
      return functorStrMap;
  }, function (dictApplicative) {
      return Data_Traversable.traverse(traversableStrMap)(dictApplicative)(Control_Category.id(Control_Category.categoryFn));
  }, function (dictApplicative) {
      return function (f) {
          return function (ms) {
              return Data_Foldable.foldr(Data_List.foldableList)(function (x) {
                  return function (acc) {
                      return Control_Apply.apply(dictApplicative["__superclass_Control.Apply.Apply_0"]())(Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(union)(x))(acc);
                  };
              })(Control_Applicative.pure(dictApplicative)($foreign.empty))(Data_Functor.map(Data_List.functorList)(Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Tuple.uncurry(singleton)))(Data_Functor.map(Data_List.functorList)(Data_Traversable.traverse(Data_Tuple.traversableTuple)(dictApplicative)(f))(toList(ms))));
          };
      };
  });
  exports["fold"] = fold;
  exports["foldM"] = foldM;
  exports["foldMap"] = foldMap;
  exports["fromFoldable"] = fromFoldable;
  exports["insert"] = insert;
  exports["lookup"] = lookup;
  exports["pureST"] = pureST;
  exports["singleton"] = singleton;
  exports["thawST"] = thawST;
  exports["toList"] = toList;
  exports["union"] = union;
  exports["values"] = values;
  exports["functorStrMap"] = functorStrMap;
  exports["foldableStrMap"] = foldableStrMap;
  exports["traversableStrMap"] = traversableStrMap;
  exports["empty"] = $foreign.empty;
})(PS["Data.StrMap"] = PS["Data.StrMap"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Data.Argonaut.Core"];
  var Prelude = PS["Prelude"];
  var Data_Tuple = PS["Data.Tuple"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Function_Uncurried = PS["Data.Function.Uncurried"];
  var Data_StrMap = PS["Data.StrMap"];
  var Data_Eq = PS["Data.Eq"];
  var Data_Ord = PS["Data.Ord"];
  var Data_Ordering = PS["Data.Ordering"];
  var Data_Show = PS["Data.Show"];
  var Data_Function = PS["Data.Function"];        
  var verbJsonType = function (def) {
      return function (f) {
          return function (fold) {
              return fold(def)(f);
          };
      };
  };
  var toJsonType = verbJsonType(Data_Maybe.Nothing.value)(Data_Maybe.Just.create);
  var showJson = new Data_Show.Show($foreign.stringify);
  var jsonSingletonObject = function (key) {
      return function (val) {
          return Data_Function.apply($foreign.fromObject)(Data_StrMap.singleton(key)(val));
      };
  };                                            
  var jsonEmptyObject = $foreign.fromObject(Data_StrMap.empty);      
  var foldJsonString = function (d) {
      return function (f) {
          return function (j) {
              return $foreign._foldJson(Data_Function["const"](d), Data_Function["const"](d), Data_Function["const"](d), f, Data_Function["const"](d), Data_Function["const"](d), j);
          };
      };
  };                                        
  var foldJsonObject = function (d) {
      return function (f) {
          return function (j) {
              return $foreign._foldJson(Data_Function["const"](d), Data_Function["const"](d), Data_Function["const"](d), Data_Function["const"](d), Data_Function["const"](d), f, j);
          };
      };
  };                                        
  var toObject = toJsonType(foldJsonObject);
  var foldJsonNumber = function (d) {
      return function (f) {
          return function (j) {
              return $foreign._foldJson(Data_Function["const"](d), Data_Function["const"](d), f, Data_Function["const"](d), Data_Function["const"](d), Data_Function["const"](d), j);
          };
      };
  };                                          
  var foldJsonArray = function (d) {
      return function (f) {
          return function (j) {
              return $foreign._foldJson(Data_Function["const"](d), Data_Function["const"](d), Data_Function["const"](d), Data_Function["const"](d), f, Data_Function["const"](d), j);
          };
      };
  };                                      
  var toArray = toJsonType(foldJsonArray);
  exports["foldJsonArray"] = foldJsonArray;
  exports["foldJsonNumber"] = foldJsonNumber;
  exports["foldJsonObject"] = foldJsonObject;
  exports["foldJsonString"] = foldJsonString;
  exports["jsonEmptyObject"] = jsonEmptyObject;
  exports["jsonSingletonObject"] = jsonSingletonObject;
  exports["toArray"] = toArray;
  exports["toObject"] = toObject;
  exports["showJson"] = showJson;
  exports["fromObject"] = $foreign.fromObject;
  exports["fromString"] = $foreign.fromString;
})(PS["Data.Argonaut.Core"] = PS["Data.Argonaut.Core"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Data_Foldable = PS["Data.Foldable"];
  var Data_List = PS["Data.List"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Monoid = PS["Data.Monoid"];
  var Data_Traversable = PS["Data.Traversable"];
  var Data_Tuple = PS["Data.Tuple"];
  var Partial_Unsafe = PS["Partial.Unsafe"];
  var Data_Eq = PS["Data.Eq"];
  var Data_Show = PS["Data.Show"];
  var Data_Semigroup = PS["Data.Semigroup"];
  var Data_Ord = PS["Data.Ord"];
  var Data_Functor = PS["Data.Functor"];
  var Control_Apply = PS["Control.Apply"];
  var Control_Applicative = PS["Control.Applicative"];
  var Control_Category = PS["Control.Category"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Data_Ordering = PS["Data.Ordering"];
  var Data_Function = PS["Data.Function"];
  var Data_Semiring = PS["Data.Semiring"];        
  var Leaf = (function () {
      function Leaf() {

      };
      Leaf.value = new Leaf();
      return Leaf;
  })();
  var Two = (function () {
      function Two(value0, value1, value2, value3) {
          this.value0 = value0;
          this.value1 = value1;
          this.value2 = value2;
          this.value3 = value3;
      };
      Two.create = function (value0) {
          return function (value1) {
              return function (value2) {
                  return function (value3) {
                      return new Two(value0, value1, value2, value3);
                  };
              };
          };
      };
      return Two;
  })();
  var Three = (function () {
      function Three(value0, value1, value2, value3, value4, value5, value6) {
          this.value0 = value0;
          this.value1 = value1;
          this.value2 = value2;
          this.value3 = value3;
          this.value4 = value4;
          this.value5 = value5;
          this.value6 = value6;
      };
      Three.create = function (value0) {
          return function (value1) {
              return function (value2) {
                  return function (value3) {
                      return function (value4) {
                          return function (value5) {
                              return function (value6) {
                                  return new Three(value0, value1, value2, value3, value4, value5, value6);
                              };
                          };
                      };
                  };
              };
          };
      };
      return Three;
  })();
  var TwoLeft = (function () {
      function TwoLeft(value0, value1, value2) {
          this.value0 = value0;
          this.value1 = value1;
          this.value2 = value2;
      };
      TwoLeft.create = function (value0) {
          return function (value1) {
              return function (value2) {
                  return new TwoLeft(value0, value1, value2);
              };
          };
      };
      return TwoLeft;
  })();
  var TwoRight = (function () {
      function TwoRight(value0, value1, value2) {
          this.value0 = value0;
          this.value1 = value1;
          this.value2 = value2;
      };
      TwoRight.create = function (value0) {
          return function (value1) {
              return function (value2) {
                  return new TwoRight(value0, value1, value2);
              };
          };
      };
      return TwoRight;
  })();
  var ThreeLeft = (function () {
      function ThreeLeft(value0, value1, value2, value3, value4, value5) {
          this.value0 = value0;
          this.value1 = value1;
          this.value2 = value2;
          this.value3 = value3;
          this.value4 = value4;
          this.value5 = value5;
      };
      ThreeLeft.create = function (value0) {
          return function (value1) {
              return function (value2) {
                  return function (value3) {
                      return function (value4) {
                          return function (value5) {
                              return new ThreeLeft(value0, value1, value2, value3, value4, value5);
                          };
                      };
                  };
              };
          };
      };
      return ThreeLeft;
  })();
  var ThreeMiddle = (function () {
      function ThreeMiddle(value0, value1, value2, value3, value4, value5) {
          this.value0 = value0;
          this.value1 = value1;
          this.value2 = value2;
          this.value3 = value3;
          this.value4 = value4;
          this.value5 = value5;
      };
      ThreeMiddle.create = function (value0) {
          return function (value1) {
              return function (value2) {
                  return function (value3) {
                      return function (value4) {
                          return function (value5) {
                              return new ThreeMiddle(value0, value1, value2, value3, value4, value5);
                          };
                      };
                  };
              };
          };
      };
      return ThreeMiddle;
  })();
  var ThreeRight = (function () {
      function ThreeRight(value0, value1, value2, value3, value4, value5) {
          this.value0 = value0;
          this.value1 = value1;
          this.value2 = value2;
          this.value3 = value3;
          this.value4 = value4;
          this.value5 = value5;
      };
      ThreeRight.create = function (value0) {
          return function (value1) {
              return function (value2) {
                  return function (value3) {
                      return function (value4) {
                          return function (value5) {
                              return new ThreeRight(value0, value1, value2, value3, value4, value5);
                          };
                      };
                  };
              };
          };
      };
      return ThreeRight;
  })();
  var KickUp = (function () {
      function KickUp(value0, value1, value2, value3) {
          this.value0 = value0;
          this.value1 = value1;
          this.value2 = value2;
          this.value3 = value3;
      };
      KickUp.create = function (value0) {
          return function (value1) {
              return function (value2) {
                  return function (value3) {
                      return new KickUp(value0, value1, value2, value3);
                  };
              };
          };
      };
      return KickUp;
  })();
  var values = function (v) {
      if (v instanceof Leaf) {
          return Data_List.Nil.value;
      };
      if (v instanceof Two) {
          return Data_Semigroup.append(Data_List.semigroupList)(values(v.value0))(Data_Semigroup.append(Data_List.semigroupList)(Control_Applicative.pure(Data_List.applicativeList)(v.value2))(values(v.value3)));
      };
      if (v instanceof Three) {
          return Data_Semigroup.append(Data_List.semigroupList)(values(v.value0))(Data_Semigroup.append(Data_List.semigroupList)(Control_Applicative.pure(Data_List.applicativeList)(v.value2))(Data_Semigroup.append(Data_List.semigroupList)(values(v.value3))(Data_Semigroup.append(Data_List.semigroupList)(Control_Applicative.pure(Data_List.applicativeList)(v.value5))(values(v.value6)))));
      };
      throw new Error("Failed pattern match at Data.Map line 390, column 1 - line 390, column 18: " + [ v.constructor.name ]);
  };
  var lookup = function (dictOrd) {
      return Partial_Unsafe.unsafePartial(function (dictPartial) {
          return function (k) {
              return function (tree) {
                  if (tree instanceof Leaf) {
                      return Data_Maybe.Nothing.value;
                  };
                  var comp = Data_Ord.compare(dictOrd);
                  var __unused = function (dictPartial1) {
                      return function ($dollar35) {
                          return $dollar35;
                      };
                  };
                  return __unused(dictPartial)((function () {
                      if (tree instanceof Two) {
                          var $147 = comp(k)(tree.value1);
                          if ($147 instanceof Data_Ordering.EQ) {
                              return new Data_Maybe.Just(tree.value2);
                          };
                          if ($147 instanceof Data_Ordering.LT) {
                              return lookup(dictOrd)(k)(tree.value0);
                          };
                          return lookup(dictOrd)(k)(tree.value3);
                      };
                      if (tree instanceof Three) {
                          var $152 = comp(k)(tree.value1);
                          if ($152 instanceof Data_Ordering.EQ) {
                              return new Data_Maybe.Just(tree.value2);
                          };
                          var $154 = comp(k)(tree.value4);
                          if ($154 instanceof Data_Ordering.EQ) {
                              return new Data_Maybe.Just(tree.value5);
                          };
                          if ($152 instanceof Data_Ordering.LT) {
                              return lookup(dictOrd)(k)(tree.value0);
                          };
                          if ($154 instanceof Data_Ordering.GT) {
                              return lookup(dictOrd)(k)(tree.value6);
                          };
                          return lookup(dictOrd)(k)(tree.value3);
                      };
                      throw new Error("Failed pattern match at Data.Map line 132, column 10 - line 146, column 39: " + [ tree.constructor.name ]);
                  })());
              };
          };
      });
  }; 
  var fromZipper = function (__copy_dictOrd) {
      return function (__copy_v) {
          return function (__copy_tree) {
              var dictOrd = __copy_dictOrd;
              var v = __copy_v;
              var tree = __copy_tree;
              tco: while (true) {
                  if (v instanceof Data_List.Nil) {
                      return tree;
                  };
                  if (v instanceof Data_List.Cons) {
                      if (v.value0 instanceof TwoLeft) {
                          var __tco_dictOrd = dictOrd;
                          var __tco_v = v.value1;
                          var __tco_tree = new Two(tree, v.value0.value0, v.value0.value1, v.value0.value2);
                          dictOrd = __tco_dictOrd;
                          v = __tco_v;
                          tree = __tco_tree;
                          continue tco;
                      };
                      if (v.value0 instanceof TwoRight) {
                          var __tco_dictOrd = dictOrd;
                          var __tco_v = v.value1;
                          var __tco_tree = new Two(v.value0.value0, v.value0.value1, v.value0.value2, tree);
                          dictOrd = __tco_dictOrd;
                          v = __tco_v;
                          tree = __tco_tree;
                          continue tco;
                      };
                      if (v.value0 instanceof ThreeLeft) {
                          var __tco_dictOrd = dictOrd;
                          var __tco_v = v.value1;
                          var __tco_tree = new Three(tree, v.value0.value0, v.value0.value1, v.value0.value2, v.value0.value3, v.value0.value4, v.value0.value5);
                          dictOrd = __tco_dictOrd;
                          v = __tco_v;
                          tree = __tco_tree;
                          continue tco;
                      };
                      if (v.value0 instanceof ThreeMiddle) {
                          var __tco_dictOrd = dictOrd;
                          var __tco_v = v.value1;
                          var __tco_tree = new Three(v.value0.value0, v.value0.value1, v.value0.value2, tree, v.value0.value3, v.value0.value4, v.value0.value5);
                          dictOrd = __tco_dictOrd;
                          v = __tco_v;
                          tree = __tco_tree;
                          continue tco;
                      };
                      if (v.value0 instanceof ThreeRight) {
                          var __tco_dictOrd = dictOrd;
                          var __tco_v = v.value1;
                          var __tco_tree = new Three(v.value0.value0, v.value0.value1, v.value0.value2, v.value0.value3, v.value0.value4, v.value0.value5, tree);
                          dictOrd = __tco_dictOrd;
                          v = __tco_v;
                          tree = __tco_tree;
                          continue tco;
                      };
                      throw new Error("Failed pattern match at Data.Map line 223, column 3 - line 228, column 88: " + [ v.value0.constructor.name ]);
                  };
                  throw new Error("Failed pattern match at Data.Map line 221, column 1 - line 221, column 27: " + [ v.constructor.name, tree.constructor.name ]);
              };
          };
      };
  };
  var insert = function (dictOrd) {
      var up = function (__copy_v) {
          return function (__copy_v1) {
              var v = __copy_v;
              var v1 = __copy_v1;
              tco: while (true) {
                  if (v instanceof Data_List.Nil) {
                      return new Two(v1.value0, v1.value1, v1.value2, v1.value3);
                  };
                  if (v instanceof Data_List.Cons) {
                      if (v.value0 instanceof TwoLeft) {
                          return fromZipper(dictOrd)(v.value1)(new Three(v1.value0, v1.value1, v1.value2, v1.value3, v.value0.value0, v.value0.value1, v.value0.value2));
                      };
                      if (v.value0 instanceof TwoRight) {
                          return fromZipper(dictOrd)(v.value1)(new Three(v.value0.value0, v.value0.value1, v.value0.value2, v1.value0, v1.value1, v1.value2, v1.value3));
                      };
                      if (v.value0 instanceof ThreeLeft) {
                          var __tco_v = v.value1;
                          var __tco_v1 = new KickUp(new Two(v1.value0, v1.value1, v1.value2, v1.value3), v.value0.value0, v.value0.value1, new Two(v.value0.value2, v.value0.value3, v.value0.value4, v.value0.value5));
                          v = __tco_v;
                          v1 = __tco_v1;
                          continue tco;
                      };
                      if (v.value0 instanceof ThreeMiddle) {
                          var __tco_v = v.value1;
                          var __tco_v1 = new KickUp(new Two(v.value0.value0, v.value0.value1, v.value0.value2, v1.value0), v1.value1, v1.value2, new Two(v1.value3, v.value0.value3, v.value0.value4, v.value0.value5));
                          v = __tco_v;
                          v1 = __tco_v1;
                          continue tco;
                      };
                      if (v.value0 instanceof ThreeRight) {
                          var __tco_v = v.value1;
                          var __tco_v1 = new KickUp(new Two(v.value0.value0, v.value0.value1, v.value0.value2, v.value0.value3), v.value0.value4, v.value0.value5, new Two(v1.value0, v1.value1, v1.value2, v1.value3));
                          v = __tco_v;
                          v1 = __tco_v1;
                          continue tco;
                      };
                      throw new Error("Failed pattern match at Data.Map line 259, column 5 - line 264, column 104: " + [ v.value0.constructor.name, v1.constructor.name ]);
                  };
                  throw new Error("Failed pattern match at Data.Map line 257, column 3 - line 257, column 54: " + [ v.constructor.name, v1.constructor.name ]);
              };
          };
      };
      var comp = Data_Ord.compare(dictOrd);
      var down = function (__copy_ctx) {
          return function (__copy_k) {
              return function (__copy_v) {
                  return function (__copy_v1) {
                      var ctx = __copy_ctx;
                      var k = __copy_k;
                      var v = __copy_v;
                      var v1 = __copy_v1;
                      tco: while (true) {
                          if (v1 instanceof Leaf) {
                              return up(ctx)(new KickUp(Leaf.value, k, v, Leaf.value));
                          };
                          if (v1 instanceof Two) {
                              var $275 = comp(k)(v1.value1);
                              if ($275 instanceof Data_Ordering.EQ) {
                                  return fromZipper(dictOrd)(ctx)(new Two(v1.value0, k, v, v1.value3));
                              };
                              if ($275 instanceof Data_Ordering.LT) {
                                  var __tco_ctx = new Data_List.Cons(new TwoLeft(v1.value1, v1.value2, v1.value3), ctx);
                                  var __tco_k = k;
                                  var __tco_v = v;
                                  var __tco_v1 = v1.value0;
                                  ctx = __tco_ctx;
                                  k = __tco_k;
                                  v = __tco_v;
                                  v1 = __tco_v1;
                                  continue tco;
                              };
                              var __tco_ctx = new Data_List.Cons(new TwoRight(v1.value0, v1.value1, v1.value2), ctx);
                              var __tco_k = k;
                              var __tco_v = v;
                              var __tco_v1 = v1.value3;
                              ctx = __tco_ctx;
                              k = __tco_k;
                              v = __tco_v;
                              v1 = __tco_v1;
                              continue tco;
                          };
                          if (v1 instanceof Three) {
                              var $280 = comp(k)(v1.value1);
                              if ($280 instanceof Data_Ordering.EQ) {
                                  return fromZipper(dictOrd)(ctx)(new Three(v1.value0, k, v, v1.value3, v1.value4, v1.value5, v1.value6));
                              };
                              var $282 = comp(k)(v1.value4);
                              if ($282 instanceof Data_Ordering.EQ) {
                                  return fromZipper(dictOrd)(ctx)(new Three(v1.value0, v1.value1, v1.value2, v1.value3, k, v, v1.value6));
                              };
                              if ($280 instanceof Data_Ordering.LT) {
                                  var __tco_ctx = new Data_List.Cons(new ThreeLeft(v1.value1, v1.value2, v1.value3, v1.value4, v1.value5, v1.value6), ctx);
                                  var __tco_k = k;
                                  var __tco_v = v;
                                  var __tco_v1 = v1.value0;
                                  ctx = __tco_ctx;
                                  k = __tco_k;
                                  v = __tco_v;
                                  v1 = __tco_v1;
                                  continue tco;
                              };
                              if ($280 instanceof Data_Ordering.GT && $282 instanceof Data_Ordering.LT) {
                                  var __tco_ctx = new Data_List.Cons(new ThreeMiddle(v1.value0, v1.value1, v1.value2, v1.value4, v1.value5, v1.value6), ctx);
                                  var __tco_k = k;
                                  var __tco_v = v;
                                  var __tco_v1 = v1.value3;
                                  ctx = __tco_ctx;
                                  k = __tco_k;
                                  v = __tco_v;
                                  v1 = __tco_v1;
                                  continue tco;
                              };
                              var __tco_ctx = new Data_List.Cons(new ThreeRight(v1.value0, v1.value1, v1.value2, v1.value3, v1.value4, v1.value5), ctx);
                              var __tco_k = k;
                              var __tco_v = v;
                              var __tco_v1 = v1.value6;
                              ctx = __tco_ctx;
                              k = __tco_k;
                              v = __tco_v;
                              v1 = __tco_v1;
                              continue tco;
                          };
                          throw new Error("Failed pattern match at Data.Map line 240, column 3 - line 240, column 52: " + [ ctx.constructor.name, k.constructor.name, v.constructor.name, v1.constructor.name ]);
                      };
                  };
              };
          };
      };
      return down(Data_List.Nil.value);
  };
  var pop = function (dictOrd) {
      var up = Partial_Unsafe.unsafePartial(function (dictPartial) {
          return function (ctxs) {
              return function (tree) {
                  if (ctxs instanceof Data_List.Nil) {
                      return tree;
                  };
                  if (ctxs instanceof Data_List.Cons) {
                      var __unused = function (dictPartial1) {
                          return function ($dollar43) {
                              return $dollar43;
                          };
                      };
                      return __unused(dictPartial)((function () {
                          if (ctxs.value0 instanceof TwoLeft && (ctxs.value0.value2 instanceof Leaf && tree instanceof Leaf)) {
                              return fromZipper(dictOrd)(ctxs.value1)(new Two(Leaf.value, ctxs.value0.value0, ctxs.value0.value1, Leaf.value));
                          };
                          if (ctxs.value0 instanceof TwoRight && (ctxs.value0.value0 instanceof Leaf && tree instanceof Leaf)) {
                              return fromZipper(dictOrd)(ctxs.value1)(new Two(Leaf.value, ctxs.value0.value1, ctxs.value0.value2, Leaf.value));
                          };
                          if (ctxs.value0 instanceof TwoLeft && ctxs.value0.value2 instanceof Two) {
                              return up(ctxs.value1)(new Three(tree, ctxs.value0.value0, ctxs.value0.value1, ctxs.value0.value2.value0, ctxs.value0.value2.value1, ctxs.value0.value2.value2, ctxs.value0.value2.value3));
                          };
                          if (ctxs.value0 instanceof TwoRight && ctxs.value0.value0 instanceof Two) {
                              return up(ctxs.value1)(new Three(ctxs.value0.value0.value0, ctxs.value0.value0.value1, ctxs.value0.value0.value2, ctxs.value0.value0.value3, ctxs.value0.value1, ctxs.value0.value2, tree));
                          };
                          if (ctxs.value0 instanceof TwoLeft && ctxs.value0.value2 instanceof Three) {
                              return fromZipper(dictOrd)(ctxs.value1)(new Two(new Two(tree, ctxs.value0.value0, ctxs.value0.value1, ctxs.value0.value2.value0), ctxs.value0.value2.value1, ctxs.value0.value2.value2, new Two(ctxs.value0.value2.value3, ctxs.value0.value2.value4, ctxs.value0.value2.value5, ctxs.value0.value2.value6)));
                          };
                          if (ctxs.value0 instanceof TwoRight && ctxs.value0.value0 instanceof Three) {
                              return fromZipper(dictOrd)(ctxs.value1)(new Two(new Two(ctxs.value0.value0.value0, ctxs.value0.value0.value1, ctxs.value0.value0.value2, ctxs.value0.value0.value3), ctxs.value0.value0.value4, ctxs.value0.value0.value5, new Two(ctxs.value0.value0.value6, ctxs.value0.value1, ctxs.value0.value2, tree)));
                          };
                          if (ctxs.value0 instanceof ThreeLeft && (ctxs.value0.value2 instanceof Leaf && (ctxs.value0.value5 instanceof Leaf && tree instanceof Leaf))) {
                              return fromZipper(dictOrd)(ctxs.value1)(new Three(Leaf.value, ctxs.value0.value0, ctxs.value0.value1, Leaf.value, ctxs.value0.value3, ctxs.value0.value4, Leaf.value));
                          };
                          if (ctxs.value0 instanceof ThreeMiddle && (ctxs.value0.value0 instanceof Leaf && (ctxs.value0.value5 instanceof Leaf && tree instanceof Leaf))) {
                              return fromZipper(dictOrd)(ctxs.value1)(new Three(Leaf.value, ctxs.value0.value1, ctxs.value0.value2, Leaf.value, ctxs.value0.value3, ctxs.value0.value4, Leaf.value));
                          };
                          if (ctxs.value0 instanceof ThreeRight && (ctxs.value0.value0 instanceof Leaf && (ctxs.value0.value3 instanceof Leaf && tree instanceof Leaf))) {
                              return fromZipper(dictOrd)(ctxs.value1)(new Three(Leaf.value, ctxs.value0.value1, ctxs.value0.value2, Leaf.value, ctxs.value0.value4, ctxs.value0.value5, Leaf.value));
                          };
                          if (ctxs.value0 instanceof ThreeLeft && ctxs.value0.value2 instanceof Two) {
                              return fromZipper(dictOrd)(ctxs.value1)(new Two(new Three(tree, ctxs.value0.value0, ctxs.value0.value1, ctxs.value0.value2.value0, ctxs.value0.value2.value1, ctxs.value0.value2.value2, ctxs.value0.value2.value3), ctxs.value0.value3, ctxs.value0.value4, ctxs.value0.value5));
                          };
                          if (ctxs.value0 instanceof ThreeMiddle && ctxs.value0.value0 instanceof Two) {
                              return fromZipper(dictOrd)(ctxs.value1)(new Two(new Three(ctxs.value0.value0.value0, ctxs.value0.value0.value1, ctxs.value0.value0.value2, ctxs.value0.value0.value3, ctxs.value0.value1, ctxs.value0.value2, tree), ctxs.value0.value3, ctxs.value0.value4, ctxs.value0.value5));
                          };
                          if (ctxs.value0 instanceof ThreeMiddle && ctxs.value0.value5 instanceof Two) {
                              return fromZipper(dictOrd)(ctxs.value1)(new Two(ctxs.value0.value0, ctxs.value0.value1, ctxs.value0.value2, new Three(tree, ctxs.value0.value3, ctxs.value0.value4, ctxs.value0.value5.value0, ctxs.value0.value5.value1, ctxs.value0.value5.value2, ctxs.value0.value5.value3)));
                          };
                          if (ctxs.value0 instanceof ThreeRight && ctxs.value0.value3 instanceof Two) {
                              return fromZipper(dictOrd)(ctxs.value1)(new Two(ctxs.value0.value0, ctxs.value0.value1, ctxs.value0.value2, new Three(ctxs.value0.value3.value0, ctxs.value0.value3.value1, ctxs.value0.value3.value2, ctxs.value0.value3.value3, ctxs.value0.value4, ctxs.value0.value5, tree)));
                          };
                          if (ctxs.value0 instanceof ThreeLeft && ctxs.value0.value2 instanceof Three) {
                              return fromZipper(dictOrd)(ctxs.value1)(new Three(new Two(tree, ctxs.value0.value0, ctxs.value0.value1, ctxs.value0.value2.value0), ctxs.value0.value2.value1, ctxs.value0.value2.value2, new Two(ctxs.value0.value2.value3, ctxs.value0.value2.value4, ctxs.value0.value2.value5, ctxs.value0.value2.value6), ctxs.value0.value3, ctxs.value0.value4, ctxs.value0.value5));
                          };
                          if (ctxs.value0 instanceof ThreeMiddle && ctxs.value0.value0 instanceof Three) {
                              return fromZipper(dictOrd)(ctxs.value1)(new Three(new Two(ctxs.value0.value0.value0, ctxs.value0.value0.value1, ctxs.value0.value0.value2, ctxs.value0.value0.value3), ctxs.value0.value0.value4, ctxs.value0.value0.value5, new Two(ctxs.value0.value0.value6, ctxs.value0.value1, ctxs.value0.value2, tree), ctxs.value0.value3, ctxs.value0.value4, ctxs.value0.value5));
                          };
                          if (ctxs.value0 instanceof ThreeMiddle && ctxs.value0.value5 instanceof Three) {
                              return fromZipper(dictOrd)(ctxs.value1)(new Three(ctxs.value0.value0, ctxs.value0.value1, ctxs.value0.value2, new Two(tree, ctxs.value0.value3, ctxs.value0.value4, ctxs.value0.value5.value0), ctxs.value0.value5.value1, ctxs.value0.value5.value2, new Two(ctxs.value0.value5.value3, ctxs.value0.value5.value4, ctxs.value0.value5.value5, ctxs.value0.value5.value6)));
                          };
                          if (ctxs.value0 instanceof ThreeRight && ctxs.value0.value3 instanceof Three) {
                              return fromZipper(dictOrd)(ctxs.value1)(new Three(ctxs.value0.value0, ctxs.value0.value1, ctxs.value0.value2, new Two(ctxs.value0.value3.value0, ctxs.value0.value3.value1, ctxs.value0.value3.value2, ctxs.value0.value3.value3), ctxs.value0.value3.value4, ctxs.value0.value3.value5, new Two(ctxs.value0.value3.value6, ctxs.value0.value4, ctxs.value0.value5, tree)));
                          };
                          throw new Error("Failed pattern match at Data.Map line 309, column 9 - line 326, column 136: " + [ ctxs.value0.constructor.name, tree.constructor.name ]);
                      })());
                  };
                  throw new Error("Failed pattern match at Data.Map line 306, column 5 - line 326, column 136: " + [ ctxs.constructor.name ]);
              };
          };
      });
      var removeMaxNode = Partial_Unsafe.unsafePartial(function (dictPartial) {
          return function (ctx) {
              return function (m) {
                  var __unused = function (dictPartial1) {
                      return function ($dollar45) {
                          return $dollar45;
                      };
                  };
                  return __unused(dictPartial)((function () {
                      if (m instanceof Two && (m.value0 instanceof Leaf && m.value3 instanceof Leaf)) {
                          return up(ctx)(Leaf.value);
                      };
                      if (m instanceof Two) {
                          return removeMaxNode(new Data_List.Cons(new TwoRight(m.value0, m.value1, m.value2), ctx))(m.value3);
                      };
                      if (m instanceof Three && (m.value0 instanceof Leaf && (m.value3 instanceof Leaf && m.value6 instanceof Leaf))) {
                          return up(new Data_List.Cons(new TwoRight(Leaf.value, m.value1, m.value2), ctx))(Leaf.value);
                      };
                      if (m instanceof Three) {
                          return removeMaxNode(new Data_List.Cons(new ThreeRight(m.value0, m.value1, m.value2, m.value3, m.value4, m.value5), ctx))(m.value6);
                      };
                      throw new Error("Failed pattern match at Data.Map line 338, column 5 - line 342, column 107: " + [ m.constructor.name ]);
                  })());
              };
          };
      });
      var maxNode = Partial_Unsafe.unsafePartial(function (dictPartial) {
          return function (m) {
              var __unused = function (dictPartial1) {
                  return function ($dollar47) {
                      return $dollar47;
                  };
              };
              return __unused(dictPartial)((function () {
                  if (m instanceof Two && m.value3 instanceof Leaf) {
                      return {
                          key: m.value1, 
                          value: m.value2
                      };
                  };
                  if (m instanceof Two) {
                      return maxNode(m.value3);
                  };
                  if (m instanceof Three && m.value6 instanceof Leaf) {
                      return {
                          key: m.value4, 
                          value: m.value5
                      };
                  };
                  if (m instanceof Three) {
                      return maxNode(m.value6);
                  };
                  throw new Error("Failed pattern match at Data.Map line 329, column 33 - line 333, column 45: " + [ m.constructor.name ]);
              })());
          };
      });
      var comp = Data_Ord.compare(dictOrd);
      var down = Partial_Unsafe.unsafePartial(function (dictPartial) {
          return function (ctx) {
              return function (k) {
                  return function (m) {
                      if (m instanceof Leaf) {
                          return Data_Maybe.Nothing.value;
                      };
                      if (m instanceof Two) {
                          var $493 = comp(k)(m.value1);
                          if (m.value3 instanceof Leaf && $493 instanceof Data_Ordering.EQ) {
                              return new Data_Maybe.Just(new Data_Tuple.Tuple(m.value2, up(ctx)(Leaf.value)));
                          };
                          if ($493 instanceof Data_Ordering.EQ) {
                              var max = maxNode(m.value0);
                              return new Data_Maybe.Just(new Data_Tuple.Tuple(m.value2, removeMaxNode(new Data_List.Cons(new TwoLeft(max.key, max.value, m.value3), ctx))(m.value0)));
                          };
                          if ($493 instanceof Data_Ordering.LT) {
                              return down(new Data_List.Cons(new TwoLeft(m.value1, m.value2, m.value3), ctx))(k)(m.value0);
                          };
                          return down(new Data_List.Cons(new TwoRight(m.value0, m.value1, m.value2), ctx))(k)(m.value3);
                      };
                      if (m instanceof Three) {
                          var leaves = (function () {
                              if (m.value0 instanceof Leaf && (m.value3 instanceof Leaf && m.value6 instanceof Leaf)) {
                                  return true;
                              };
                              return false;
                          })();
                          var $502 = comp(k)(m.value1);
                          var $503 = comp(k)(m.value4);
                          if (leaves && $502 instanceof Data_Ordering.EQ) {
                              return new Data_Maybe.Just(new Data_Tuple.Tuple(m.value2, fromZipper(dictOrd)(ctx)(new Two(Leaf.value, m.value4, m.value5, Leaf.value))));
                          };
                          if (leaves && $503 instanceof Data_Ordering.EQ) {
                              return new Data_Maybe.Just(new Data_Tuple.Tuple(m.value5, fromZipper(dictOrd)(ctx)(new Two(Leaf.value, m.value1, m.value2, Leaf.value))));
                          };
                          if ($502 instanceof Data_Ordering.EQ) {
                              var max = maxNode(m.value0);
                              return new Data_Maybe.Just(new Data_Tuple.Tuple(m.value2, removeMaxNode(new Data_List.Cons(new ThreeLeft(max.key, max.value, m.value3, m.value4, m.value5, m.value6), ctx))(m.value0)));
                          };
                          if ($503 instanceof Data_Ordering.EQ) {
                              var max = maxNode(m.value3);
                              return new Data_Maybe.Just(new Data_Tuple.Tuple(m.value5, removeMaxNode(new Data_List.Cons(new ThreeMiddle(m.value0, m.value1, m.value2, max.key, max.value, m.value6), ctx))(m.value3)));
                          };
                          if ($502 instanceof Data_Ordering.LT) {
                              return down(new Data_List.Cons(new ThreeLeft(m.value1, m.value2, m.value3, m.value4, m.value5, m.value6), ctx))(k)(m.value0);
                          };
                          if ($502 instanceof Data_Ordering.GT && $503 instanceof Data_Ordering.LT) {
                              return down(new Data_List.Cons(new ThreeMiddle(m.value0, m.value1, m.value2, m.value4, m.value5, m.value6), ctx))(k)(m.value3);
                          };
                          return down(new Data_List.Cons(new ThreeRight(m.value0, m.value1, m.value2, m.value3, m.value4, m.value5), ctx))(k)(m.value6);
                      };
                      throw new Error("Failed pattern match at Data.Map line 279, column 36 - line 302, column 82: " + [ m.constructor.name ]);
                  };
              };
          };
      });
      return down(Data_List.Nil.value);
  };
  var foldableMap = new Data_Foldable.Foldable(function (dictMonoid) {
      return function (f) {
          return function (m) {
              return Data_Foldable.foldMap(Data_List.foldableList)(dictMonoid)(f)(values(m));
          };
      };
  }, function (f) {
      return function (z) {
          return function (m) {
              return Data_Foldable.foldl(Data_List.foldableList)(f)(z)(values(m));
          };
      };
  }, function (f) {
      return function (z) {
          return function (m) {
              return Data_Foldable.foldr(Data_List.foldableList)(f)(z)(values(m));
          };
      };
  });
  var empty = Leaf.value;
  var $$delete = function (dictOrd) {
      return function (k) {
          return function (m) {
              return Data_Maybe.maybe(m)(Data_Tuple.snd)(pop(dictOrd)(k)(m));
          };
      };
  };
  var alter = function (dictOrd) {
      return function (f) {
          return function (k) {
              return function (m) {
                  var $580 = f(lookup(dictOrd)(k)(m));
                  if ($580 instanceof Data_Maybe.Nothing) {
                      return $$delete(dictOrd)(k)(m);
                  };
                  if ($580 instanceof Data_Maybe.Just) {
                      return insert(dictOrd)(k)($580.value0)(m);
                  };
                  throw new Error("Failed pattern match at Data.Map line 347, column 15 - line 349, column 25: " + [ $580.constructor.name ]);
              };
          };
      };
  };
  var update = function (dictOrd) {
      return function (f) {
          return function (k) {
              return function (m) {
                  return alter(dictOrd)(Data_Maybe.maybe(Data_Maybe.Nothing.value)(f))(k)(m);
              };
          };
      };
  };
  exports["alter"] = alter;
  exports["delete"] = $$delete;
  exports["empty"] = empty;
  exports["insert"] = insert;
  exports["lookup"] = lookup;
  exports["pop"] = pop;
  exports["update"] = update;
  exports["values"] = values;
  exports["foldableMap"] = foldableMap;
})(PS["Data.Map"] = PS["Data.Map"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Control_Alt = PS["Control.Alt"];
  var Control_Bind = PS["Control.Bind"];
  var Data_Bifunctor = PS["Data.Bifunctor"];
  var Data_Argonaut_Core = PS["Data.Argonaut.Core"];
  var Data_Array = PS["Data.Array"];
  var Data_Either = PS["Data.Either"];
  var Data_Foldable = PS["Data.Foldable"];
  var Data_Generic = PS["Data.Generic"];
  var Data_Int = PS["Data.Int"];
  var Data_List = PS["Data.List"];
  var Data_Map = PS["Data.Map"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_String = PS["Data.String"];
  var Data_StrMap = PS["Data.StrMap"];
  var Data_Traversable = PS["Data.Traversable"];
  var Data_Tuple = PS["Data.Tuple"];
  var Type_Proxy = PS["Type.Proxy"];
  var Control_Applicative = PS["Control.Applicative"];
  var Data_Boolean = PS["Data.Boolean"];
  var Data_Functor = PS["Data.Functor"];
  var Control_Apply = PS["Control.Apply"];
  var Data_Function = PS["Data.Function"];
  var Data_Semigroup = PS["Data.Semigroup"];
  var Data_Unit = PS["Data.Unit"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Data_Show = PS["Data.Show"];
  var Data_Eq = PS["Data.Eq"];        
  var DecodeJson = function (decodeJson) {
      this.decodeJson = decodeJson;
  };
  var decodeJsonString = new DecodeJson(Data_Argonaut_Core.foldJsonString(new Data_Either.Left("Value is not a String"))(Data_Either.Right.create));
  var decodeJsonNumber = new DecodeJson(Data_Argonaut_Core.foldJsonNumber(new Data_Either.Left("Value is not a Number"))(Data_Either.Right.create));                                                    
  var decodeJsonJson = new DecodeJson(Data_Either.Right.create);                                                                                       
  var decodeJson = function (dict) {
      return dict.decodeJson;
  }; 
  var decodeJsonInt = new DecodeJson(Control_Bind.composeKleisliFlipped(Data_Either.bindEither)(function ($66) {
      return Data_Maybe.maybe(new Data_Either.Left("Value is not an integer"))(Data_Either.Right.create)(Data_Int.fromNumber($66));
  })(decodeJson(decodeJsonNumber)));
  var decodeJOject = function ($68) {
      return Data_Maybe.maybe(new Data_Either.Left("Value is not an Object"))(Data_Either.Right.create)(Data_Argonaut_Core.toObject($68));
  };
  var decodeStrMap = function (dictDecodeJson) {
      return new DecodeJson(function ($69) {
          return Data_Bifunctor.lmap(Data_Either.bifunctorEither)(function (v) {
              return "Couldn't decode StrMap: " + v;
          })(Control_Bind.composeKleisliFlipped(Data_Either.bindEither)(Data_Traversable.traverse(Data_StrMap.traversableStrMap)(Data_Either.applicativeEither)(decodeJson(dictDecodeJson)))(decodeJOject)($69));
      });
  };
  var decodeJArray = function ($70) {
      return Data_Maybe.maybe(new Data_Either.Left("Value is not an Array"))(Data_Either.Right.create)(Data_Argonaut_Core.toArray($70));
  };
  var decodeArray = function (dictDecodeJson) {
      return new DecodeJson(function ($73) {
          return Data_Bifunctor.lmap(Data_Either.bifunctorEither)(function (v) {
              return "Couldn't decode Array: " + v;
          })(Control_Bind.composeKleisliFlipped(Data_Either.bindEither)(Data_Traversable.traverse(Data_Traversable.traversableArray)(Data_Either.applicativeEither)(decodeJson(dictDecodeJson)))(decodeJArray)($73));
      });
  };
  exports["DecodeJson"] = DecodeJson;
  exports["decodeJson"] = decodeJson;
  exports["decodeJsonNumber"] = decodeJsonNumber;
  exports["decodeJsonInt"] = decodeJsonInt;
  exports["decodeJsonString"] = decodeJsonString;
  exports["decodeJsonJson"] = decodeJsonJson;
  exports["decodeStrMap"] = decodeStrMap;
  exports["decodeArray"] = decodeArray;
})(PS["Data.Argonaut.Decode.Class"] = PS["Data.Argonaut.Decode.Class"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Data_Argonaut_Core = PS["Data.Argonaut.Core"];
  var Data_Argonaut_Decode_Class = PS["Data.Argonaut.Decode.Class"];
  var Data_Either = PS["Data.Either"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_StrMap = PS["Data.StrMap"];
  var Data_Functor = PS["Data.Functor"];
  var Control_Applicative = PS["Control.Applicative"];
  var Data_Function = PS["Data.Function"];
  var Data_Semigroup = PS["Data.Semigroup"];
  var Data_Show = PS["Data.Show"];        
  var getFieldOptional = function (dictDecodeJson) {
      return function (o) {
          return function (s) {
              var decode = function (json) {
                  return Data_Functor.map(Data_Either.functorEither)(Data_Maybe.Just.create)(Data_Argonaut_Decode_Class.decodeJson(dictDecodeJson)(json));
              };
              return Data_Maybe.maybe(Control_Applicative.pure(Data_Either.applicativeEither)(Data_Maybe.Nothing.value))(decode)(Data_StrMap.lookup(s)(o));
          };
      };
  };
  var getField = function (dictDecodeJson) {
      return function (o) {
          return function (s) {
              return Data_Maybe.maybe(Data_Function.apply(Data_Either.Left.create)("Expected field " + Data_Show.show(Data_Show.showString)(s)))(Data_Argonaut_Decode_Class.decodeJson(dictDecodeJson))(Data_StrMap.lookup(s)(o));
          };
      };
  };
  exports["getField"] = getField;
  exports["getFieldOptional"] = getFieldOptional;
})(PS["Data.Argonaut.Decode.Combinators"] = PS["Data.Argonaut.Decode.Combinators"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Data_Argonaut_Core = PS["Data.Argonaut.Core"];
  var Data_Either = PS["Data.Either"];
  var Data_Foldable = PS["Data.Foldable"];
  var Data_Generic = PS["Data.Generic"];
  var Data_Int = PS["Data.Int"];
  var Data_List = PS["Data.List"];
  var Data_Map = PS["Data.Map"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_String = PS["Data.String"];
  var Data_StrMap = PS["Data.StrMap"];
  var Data_Tuple = PS["Data.Tuple"];
  var Data_Function = PS["Data.Function"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Control_Category = PS["Control.Category"];
  var Data_Functor = PS["Data.Functor"];
  var Data_Unfoldable = PS["Data.Unfoldable"];
  var Data_Unit = PS["Data.Unit"];        
  var EncodeJson = function (encodeJson) {
      this.encodeJson = encodeJson;
  };                                                                                       
  var encodeJsonJson = new EncodeJson(Control_Category.id(Control_Category.categoryFn));
  var encodeJsonJString = new EncodeJson(Data_Argonaut_Core.fromString);
  var encodeJson = function (dict) {
      return dict.encodeJson;
  };
  exports["EncodeJson"] = EncodeJson;
  exports["encodeJson"] = encodeJson;
  exports["encodeJsonJString"] = encodeJsonJString;
  exports["encodeJsonJson"] = encodeJsonJson;
})(PS["Data.Argonaut.Encode.Class"] = PS["Data.Argonaut.Encode.Class"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Data_Argonaut_Core = PS["Data.Argonaut.Core"];
  var Data_Argonaut_Encode_Class = PS["Data.Argonaut.Encode.Class"];
  var Data_StrMap = PS["Data.StrMap"];
  var Data_Tuple = PS["Data.Tuple"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];        
  var extend = function (dictEncodeJson) {
      return function (v) {
          return function ($6) {
              return Data_Argonaut_Core.foldJsonObject(Data_Argonaut_Core.jsonSingletonObject(v.value0)(v.value1))(function ($7) {
                  return Data_Argonaut_Core.fromObject(Data_StrMap.insert(v.value0)(v.value1)($7));
              })(Data_Argonaut_Encode_Class.encodeJson(dictEncodeJson)($6));
          };
      };
  };
  var assoc = function (dictEncodeJson) {
      return function (k) {
          return function ($8) {
              return Data_Tuple.Tuple.create(k)(Data_Argonaut_Encode_Class.encodeJson(dictEncodeJson)($8));
          };
      };
  };
  exports["assoc"] = assoc;
  exports["extend"] = extend;
})(PS["Data.Argonaut.Encode.Combinators"] = PS["Data.Argonaut.Encode.Combinators"] || {});
(function(exports) {
  /* global exports */
  "use strict";

  exports.emptySTArray = function () {
    return [];
  };

  exports.pushAllSTArray = function (xs) {
    return function (as) {
      return function () {
        return xs.push.apply(xs, as);
      };
    };
  };
})(PS["Data.Array.ST"] = PS["Data.Array.ST"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Data.Array.ST"];
  var Control_Monad_Eff = PS["Control.Monad.Eff"];
  var Control_Monad_ST = PS["Control.Monad.ST"];
  var Data_Maybe = PS["Data.Maybe"];
  var pushSTArray = function (arr) {
      return function (a) {
          return $foreign.pushAllSTArray(arr)([ a ]);
      };
  };
  exports["pushSTArray"] = pushSTArray;
  exports["emptySTArray"] = $foreign.emptySTArray;
})(PS["Data.Array.ST"] = PS["Data.Array.ST"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Control_Applicative = PS["Control.Applicative"];
  var Control_Apply = PS["Control.Apply"];
  var Control_Bind = PS["Control.Bind"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Data_BooleanAlgebra = PS["Data.BooleanAlgebra"];
  var Data_Bounded = PS["Data.Bounded"];
  var Data_CommutativeRing = PS["Data.CommutativeRing"];
  var Data_Eq = PS["Data.Eq"];
  var Data_EuclideanRing = PS["Data.EuclideanRing"];
  var Data_Field = PS["Data.Field"];
  var Data_Foldable = PS["Data.Foldable"];
  var Data_Functor = PS["Data.Functor"];
  var Data_Functor_Contravariant = PS["Data.Functor.Contravariant"];
  var Data_Functor_Invariant = PS["Data.Functor.Invariant"];
  var Data_HeytingAlgebra = PS["Data.HeytingAlgebra"];
  var Data_Monoid = PS["Data.Monoid"];
  var Data_Ord = PS["Data.Ord"];
  var Data_Ring = PS["Data.Ring"];
  var Data_Semigroup = PS["Data.Semigroup"];
  var Data_Semiring = PS["Data.Semiring"];
  var Data_Show = PS["Data.Show"];
  var Data_Traversable = PS["Data.Traversable"];        
  var Const = function (x) {
      return x;
  };
  var getConst = function (v) {
      return v;
  };
  var functorConst = new Data_Functor.Functor(function (v) {
      return function (v1) {
          return v1;
      };
  });
  var applyConst = function (dictSemigroup) {
      return new Control_Apply.Apply(function () {
          return functorConst;
      }, function (v) {
          return function (v1) {
              return Data_Semigroup.append(dictSemigroup)(v)(v1);
          };
      });
  };
  var applicativeConst = function (dictMonoid) {
      return new Control_Applicative.Applicative(function () {
          return applyConst(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]());
      }, function (v) {
          return Data_Monoid.mempty(dictMonoid);
      });
  };
  exports["Const"] = Const;
  exports["getConst"] = getConst;
  exports["functorConst"] = functorConst;
  exports["applyConst"] = applyConst;
  exports["applicativeConst"] = applicativeConst;
})(PS["Data.Const"] = PS["Data.Const"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Unsafe_Coerce = PS["Unsafe.Coerce"];        
  var runExistsR = Unsafe_Coerce.unsafeCoerce;
  var mkExistsR = Unsafe_Coerce.unsafeCoerce;
  exports["mkExistsR"] = mkExistsR;
  exports["runExistsR"] = runExistsR;
})(PS["Data.ExistsR"] = PS["Data.ExistsR"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Data_Bifunctor = PS["Data.Bifunctor"];
  var Data_Either = PS["Data.Either"];
  var Data_Foldable = PS["Data.Foldable"];
  var Data_Traversable = PS["Data.Traversable"];
  var Data_Functor = PS["Data.Functor"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];        
  var Coproduct = function (x) {
      return x;
  };
  var right = function (ga) {
      return new Data_Either.Right(ga);
  };
  var left = function (fa) {
      return new Data_Either.Left(fa);
  };
  var coproduct = function (f) {
      return function (g) {
          return function (v) {
              return Data_Either.either(f)(g)(v);
          };
      };
  };
  exports["Coproduct"] = Coproduct;
  exports["coproduct"] = coproduct;
  exports["left"] = left;
  exports["right"] = right;
})(PS["Data.Functor.Coproduct"] = PS["Data.Functor.Coproduct"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Data_Either = PS["Data.Either"];
  var Data_Generic = PS["Data.Generic"];
  var Data_String = PS["Data.String"];
  var Data_Eq = PS["Data.Eq"];
  var Data_Ord = PS["Data.Ord"];
  var Data_Ordering = PS["Data.Ordering"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Show = PS["Data.Show"];
  var Control_Apply = PS["Control.Apply"];
  var Data_Unit = PS["Data.Unit"];
  var Data_Semigroup = PS["Data.Semigroup"];        
  var OPTIONS = (function () {
      function OPTIONS() {

      };
      OPTIONS.value = new OPTIONS();
      return OPTIONS;
  })();
  var GET = (function () {
      function GET() {

      };
      GET.value = new GET();
      return GET;
  })();
  var HEAD = (function () {
      function HEAD() {

      };
      HEAD.value = new HEAD();
      return HEAD;
  })();
  var POST = (function () {
      function POST() {

      };
      POST.value = new POST();
      return POST;
  })();
  var PUT = (function () {
      function PUT() {

      };
      PUT.value = new PUT();
      return PUT;
  })();
  var DELETE = (function () {
      function DELETE() {

      };
      DELETE.value = new DELETE();
      return DELETE;
  })();
  var TRACE = (function () {
      function TRACE() {

      };
      TRACE.value = new TRACE();
      return TRACE;
  })();
  var CONNECT = (function () {
      function CONNECT() {

      };
      CONNECT.value = new CONNECT();
      return CONNECT;
  })();
  var PROPFIND = (function () {
      function PROPFIND() {

      };
      PROPFIND.value = new PROPFIND();
      return PROPFIND;
  })();
  var PROPPATCH = (function () {
      function PROPPATCH() {

      };
      PROPPATCH.value = new PROPPATCH();
      return PROPPATCH;
  })();
  var MKCOL = (function () {
      function MKCOL() {

      };
      MKCOL.value = new MKCOL();
      return MKCOL;
  })();
  var COPY = (function () {
      function COPY() {

      };
      COPY.value = new COPY();
      return COPY;
  })();
  var MOVE = (function () {
      function MOVE() {

      };
      MOVE.value = new MOVE();
      return MOVE;
  })();
  var LOCK = (function () {
      function LOCK() {

      };
      LOCK.value = new LOCK();
      return LOCK;
  })();
  var UNLOCK = (function () {
      function UNLOCK() {

      };
      UNLOCK.value = new UNLOCK();
      return UNLOCK;
  })();
  var PATCH = (function () {
      function PATCH() {

      };
      PATCH.value = new PATCH();
      return PATCH;
  })();
  var unCustomMethod = function (v) {
      return v;
  };
  var showMethod = new Data_Show.Show(function (v) {
      if (v instanceof OPTIONS) {
          return "OPTIONS";
      };
      if (v instanceof GET) {
          return "GET";
      };
      if (v instanceof HEAD) {
          return "HEAD";
      };
      if (v instanceof POST) {
          return "POST";
      };
      if (v instanceof PUT) {
          return "PUT";
      };
      if (v instanceof DELETE) {
          return "DELETE";
      };
      if (v instanceof TRACE) {
          return "TRACE";
      };
      if (v instanceof CONNECT) {
          return "CONNECT";
      };
      if (v instanceof PROPFIND) {
          return "PROPFIND";
      };
      if (v instanceof PROPPATCH) {
          return "PROPPATCH";
      };
      if (v instanceof MKCOL) {
          return "MKCOL";
      };
      if (v instanceof COPY) {
          return "COPY";
      };
      if (v instanceof MOVE) {
          return "MOVE";
      };
      if (v instanceof LOCK) {
          return "LOCK";
      };
      if (v instanceof UNLOCK) {
          return "UNLOCK";
      };
      if (v instanceof PATCH) {
          return "PATCH";
      };
      throw new Error("Failed pattern match at Data.HTTP.Method line 43, column 3 - line 44, column 3: " + [ v.constructor.name ]);
  });
  var print = Data_Either.either(Data_Show.show(showMethod))(unCustomMethod);
  exports["OPTIONS"] = OPTIONS;
  exports["GET"] = GET;
  exports["HEAD"] = HEAD;
  exports["POST"] = POST;
  exports["PUT"] = PUT;
  exports["DELETE"] = DELETE;
  exports["TRACE"] = TRACE;
  exports["CONNECT"] = CONNECT;
  exports["PROPFIND"] = PROPFIND;
  exports["PROPPATCH"] = PROPPATCH;
  exports["MKCOL"] = MKCOL;
  exports["COPY"] = COPY;
  exports["MOVE"] = MOVE;
  exports["LOCK"] = LOCK;
  exports["UNLOCK"] = UNLOCK;
  exports["PATCH"] = PATCH;
  exports["print"] = print;
  exports["unCustomMethod"] = unCustomMethod;
  exports["showMethod"] = showMethod;
})(PS["Data.HTTP.Method"] = PS["Data.HTTP.Method"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Data_Either = PS["Data.Either"];
  var Data_Profunctor = PS["Data.Profunctor"];
  var Data_Function = PS["Data.Function"];
  var Data_Functor = PS["Data.Functor"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Control_Category = PS["Control.Category"];        
  var Choice = function (__superclass_Data$dotProfunctor$dotProfunctor_0, left, right) {
      this["__superclass_Data.Profunctor.Profunctor_0"] = __superclass_Data$dotProfunctor$dotProfunctor_0;
      this.left = left;
      this.right = right;
  };
  var right = function (dict) {
      return dict.right;
  };
  var left = function (dict) {
      return dict.left;
  };
  var choiceFn = new Choice(function () {
      return Data_Profunctor.profunctorFn;
  }, function (v) {
      return function (v1) {
          if (v1 instanceof Data_Either.Left) {
              return Data_Function.apply(Data_Either.Left.create)(v(v1.value0));
          };
          if (v1 instanceof Data_Either.Right) {
              return new Data_Either.Right(v1.value0);
          };
          throw new Error("Failed pattern match at Data.Profunctor.Choice line 33, column 3 - line 33, column 36: " + [ v.constructor.name, v1.constructor.name ]);
      };
  }, Data_Functor.map(Data_Either.functorEither));
  exports["Choice"] = Choice;
  exports["left"] = left;
  exports["right"] = right;
  exports["choiceFn"] = choiceFn;
})(PS["Data.Profunctor.Choice"] = PS["Data.Profunctor.Choice"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Data_Const = PS["Data.Const"];
  var Data_Either = PS["Data.Either"];
  var Data_Functor_Coproduct = PS["Data.Functor.Coproduct"];
  var Data_Identity = PS["Data.Identity"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Maybe_First = PS["Data.Maybe.First"];
  var Data_Profunctor = PS["Data.Profunctor"];
  var Data_Profunctor_Choice_1 = PS["Data.Profunctor.Choice"];
  var Data_Profunctor_Choice_1 = PS["Data.Profunctor.Choice"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Control_Applicative = PS["Control.Applicative"];
  var Data_Functor = PS["Data.Functor"];
  var Data_Function = PS["Data.Function"];
  var Control_Category = PS["Control.Category"];        
  var Tagged = function (x) {
      return x;
  };
  var unTagged = function (v) {
      return v;
  };
  var profunctorTagged = new Data_Profunctor.Profunctor(function (v) {
      return function (f) {
          return function (v1) {
              return f(v1);
          };
      };
  });
  var prj = function (p) {
      return function ($25) {
          return Data_Maybe_First.runFirst(Data_Const.getConst(p(Data_Profunctor_Choice_1.choiceFn)(Data_Const.applicativeConst(Data_Maybe_First.monoidFirst))(function ($26) {
              return Data_Const.Const(Data_Maybe_First.First(Data_Maybe.Just.create($26)));
          })($25)));
      };
  };
  var prism = function (f) {
      return function (g) {
          return function (dictChoice) {
              return function (dictApplicative) {
                  return function ($27) {
                      return Data_Profunctor.dimap(dictChoice["__superclass_Data.Profunctor.Profunctor_0"]())(g)(Data_Either.either(Control_Applicative.pure(dictApplicative))(Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(f)))(Data_Profunctor_Choice_1.right(dictChoice)($27));
                  };
              };
          };
      };
  };
  var prism$prime = function (f) {
      return function (g) {
          return function (dictChoice) {
              return function (dictApplicative) {
                  return prism(f)(function (s) {
                      return Data_Maybe.maybe(new Data_Either.Left(s))(Data_Either.Right.create)(g(s));
                  })(dictChoice)(dictApplicative);
              };
          };
      };
  };
  var injRE = function (dictChoice) {
      return function (dictApplicative) {
          return prism$prime(Data_Either.Right.create)(Data_Either.either(Data_Function["const"](Data_Maybe.Nothing.value))(Data_Maybe.Just.create))(dictChoice)(dictApplicative);
      };
  };
  var injRC = function (dictChoice) {
      return function (dictApplicative) {
          return prism$prime(Data_Functor_Coproduct.right)(Data_Functor_Coproduct.coproduct(Data_Function["const"](Data_Maybe.Nothing.value))(Data_Maybe.Just.create))(dictChoice)(dictApplicative);
      };
  };
  var injLE = function (dictChoice) {
      return function (dictApplicative) {
          return prism$prime(Data_Either.Left.create)(Data_Either.either(Data_Maybe.Just.create)(Data_Function["const"](Data_Maybe.Nothing.value)))(dictChoice)(dictApplicative);
      };
  };
  var injLC = function (dictChoice) {
      return function (dictApplicative) {
          return prism$prime(Data_Functor_Coproduct.left)(Data_Functor_Coproduct.coproduct(Data_Maybe.Just.create)(Data_Function["const"](Data_Maybe.Nothing.value)))(dictChoice)(dictApplicative);
      };
  };
  var choiceTagged = new Data_Profunctor_Choice_1.Choice(function () {
      return profunctorTagged;
  }, function (v) {
      return new Data_Either.Left(v);
  }, function (v) {
      return new Data_Either.Right(v);
  });
  var inj = function (p) {
      return function ($28) {
          return Data_Identity.runIdentity(unTagged(p(choiceTagged)(Data_Identity.applicativeIdentity)(Tagged(Data_Identity.Identity($28)))));
      };
  };
  exports["inj"] = inj;
  exports["injLC"] = injLC;
  exports["injLE"] = injLE;
  exports["injRC"] = injRC;
  exports["injRE"] = injRE;
  exports["prj"] = prj;
})(PS["Data.Injector"] = PS["Data.Injector"] || {});
(function(exports) {
  /* global exports */
  "use strict";

  // module Data.Lazy

  exports.defer = function () {

    function Defer(thunk) {
      if (this instanceof Defer) {
        this.thunk = thunk;
        return this;
      } else {
        return new Defer(thunk);
      }
    }

    Defer.prototype.force = function () {
      var value = this.thunk();
      delete this.thunk;
      this.force = function () {
        return value;
      };
      return value;
    };

    return Defer;

  }();

  exports.force = function (l) {
    return l.force();
  };
})(PS["Data.Lazy"] = PS["Data.Lazy"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Data.Lazy"];
  var Prelude = PS["Prelude"];
  var Control_Comonad = PS["Control.Comonad"];
  var Control_Extend = PS["Control.Extend"];
  var Control_Lazy = PS["Control.Lazy"];
  var Data_HeytingAlgebra = PS["Data.HeytingAlgebra"];
  var Data_Monoid = PS["Data.Monoid"];
  var Data_Semiring = PS["Data.Semiring"];
  var Data_Ring = PS["Data.Ring"];
  var Data_CommutativeRing = PS["Data.CommutativeRing"];
  var Data_EuclideanRing = PS["Data.EuclideanRing"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Data_Field = PS["Data.Field"];
  var Data_Eq = PS["Data.Eq"];
  var Data_Ord = PS["Data.Ord"];
  var Data_Bounded = PS["Data.Bounded"];
  var Data_Semigroup = PS["Data.Semigroup"];
  var Control_Apply = PS["Control.Apply"];
  var Data_Functor = PS["Data.Functor"];
  var Data_BooleanAlgebra = PS["Data.BooleanAlgebra"];
  var Control_Applicative = PS["Control.Applicative"];
  var Control_Bind = PS["Control.Bind"];
  var Data_Function = PS["Data.Function"];
  var Control_Monad = PS["Control.Monad"];
  var Data_Show = PS["Data.Show"];
  var Data_Unit = PS["Data.Unit"];
  var functorLazy = new Data_Functor.Functor(function (f) {
      return function (l) {
          return $foreign.defer(function (v) {
              return f($foreign.force(l));
          });
      };
  });
  exports["functorLazy"] = functorLazy;
  exports["defer"] = $foreign.defer;
  exports["force"] = $foreign.force;
})(PS["Data.Lazy"] = PS["Data.Lazy"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Data_Generic = PS["Data.Generic"];
  var Data_Eq = PS["Data.Eq"];
  var Data_Ord = PS["Data.Ord"];
  var Control_Apply = PS["Control.Apply"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Unit = PS["Data.Unit"];
  var Data_Show = PS["Data.Show"];
  var Data_Semigroup = PS["Data.Semigroup"];
  var unMediaType = function (v) {
      return v;
  };
  exports["unMediaType"] = unMediaType;
})(PS["Data.MediaType"] = PS["Data.MediaType"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Data_MediaType = PS["Data.MediaType"];           
  var applicationJSON = "application/json";
  exports["applicationJSON"] = applicationJSON;
})(PS["Data.MediaType.Common"] = PS["Data.MediaType.Common"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Data_Either = PS["Data.Either"];
  var Data_Functor_Coproduct = PS["Data.Functor.Coproduct"];
  var Data_Injector = PS["Data.Injector"];
  var Data_Maybe = PS["Data.Maybe"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];        
  var ChildPath = (function () {
      function ChildPath(value0, value1, value2) {
          this.value0 = value0;
          this.value1 = value1;
          this.value2 = value2;
      };
      ChildPath.create = function (value0) {
          return function (value1) {
              return function (value2) {
                  return new ChildPath(value0, value1, value2);
              };
          };
      };
      return ChildPath;
  })();
  var prjState = function (v) {
      return Data_Injector.prj(function (dictChoice) {
          return function (dictApplicative) {
              return v.value0(dictChoice)(dictApplicative);
          };
      });
  };
  var prjQuery = function (v) {
      return Data_Injector.prj(function (dictChoice) {
          return function (dictApplicative) {
              return v.value1(dictChoice)(dictApplicative);
          };
      });
  };
  var injState = function (v) {
      return Data_Injector.inj(function (dictChoice) {
          return function (dictApplicative) {
              return v.value0(dictChoice)(dictApplicative);
          };
      });
  };
  var injSlot = function (v) {
      return Data_Injector.inj(function (dictChoice) {
          return function (dictApplicative) {
              return v.value2(dictChoice)(dictApplicative);
          };
      });
  };
  var injQuery = function (v) {
      return Data_Injector.inj(function (dictChoice) {
          return function (dictApplicative) {
              return v.value1(dictChoice)(dictApplicative);
          };
      });
  };
  var cpR = new ChildPath(function (dictChoice) {
      return function (dictApplicative) {
          return Data_Injector.injRE(dictChoice)(dictApplicative);
      };
  }, function (dictChoice) {
      return function (dictApplicative) {
          return Data_Injector.injRC(dictChoice)(dictApplicative);
      };
  }, function (dictChoice) {
      return function (dictApplicative) {
          return Data_Injector.injRE(dictChoice)(dictApplicative);
      };
  });
  var cpL = new ChildPath(function (dictChoice) {
      return function (dictApplicative) {
          return Data_Injector.injLE(dictChoice)(dictApplicative);
      };
  }, function (dictChoice) {
      return function (dictApplicative) {
          return Data_Injector.injLC(dictChoice)(dictApplicative);
      };
  }, function (dictChoice) {
      return function (dictApplicative) {
          return Data_Injector.injLE(dictChoice)(dictApplicative);
      };
  });
  exports["ChildPath"] = ChildPath;
  exports["cpL"] = cpL;
  exports["cpR"] = cpR;
  exports["injQuery"] = injQuery;
  exports["injSlot"] = injSlot;
  exports["injState"] = injState;
  exports["prjQuery"] = prjQuery;
  exports["prjState"] = prjState;
})(PS["Halogen.Component.ChildPath"] = PS["Halogen.Component.ChildPath"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Control_Coroutine_Aff = PS["Control.Coroutine.Aff"];
  var Control_Coroutine_Stalling = PS["Control.Coroutine.Stalling"];
  var Control_Monad_Aff_AVar = PS["Control.Monad.Aff.AVar"];
  var Control_Monad_Aff_Free = PS["Control.Monad.Aff.Free"];
  var Control_Monad_Eff = PS["Control.Monad.Eff"];
  var Control_Monad_Free = PS["Control.Monad.Free"];
  var Control_Monad_Free_Trans = PS["Control.Monad.Free.Trans"];
  var Control_Monad_Rec_Class = PS["Control.Monad.Rec.Class"];
  var Data_Const = PS["Data.Const"];
  var Data_Either = PS["Data.Either"];
  var Data_Functor_Coproduct = PS["Data.Functor.Coproduct"];
  var Data_Maybe = PS["Data.Maybe"];
  var Unsafe_Coerce = PS["Unsafe.Coerce"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Control_Coroutine = PS["Control.Coroutine"];
  var Data_Function = PS["Data.Function"];
  var Control_Bind = PS["Control.Bind"];               
  var runEventSource = function (v) {
      return v;
  };
  var fromParentEventSource = Unsafe_Coerce.unsafeCoerce;
  exports["fromParentEventSource"] = fromParentEventSource;
  exports["runEventSource"] = runEventSource;
})(PS["Halogen.Query.EventSource"] = PS["Halogen.Query.EventSource"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Control_Monad_State = PS["Control.Monad.State"];
  var Data_Functor = PS["Data.Functor"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Control_Bind = PS["Control.Bind"];
  var Control_Monad_State_Class = PS["Control.Monad.State.Class"];
  var Control_Applicative = PS["Control.Applicative"];        
  var Get = (function () {
      function Get(value0) {
          this.value0 = value0;
      };
      Get.create = function (value0) {
          return new Get(value0);
      };
      return Get;
  })();
  var Modify = (function () {
      function Modify(value0, value1) {
          this.value0 = value0;
          this.value1 = value1;
      };
      Modify.create = function (value0) {
          return function (value1) {
              return new Modify(value0, value1);
          };
      };
      return Modify;
  })();
  var stateN = function (dictMonad) {
      return function (dictMonadState) {
          return function (v) {
              if (v instanceof Get) {
                  return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(Control_Monad_State_Class.get(dictMonadState))(function ($22) {
                      return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(v.value0($22));
                  });
              };
              if (v instanceof Modify) {
                  return Data_Functor.voidLeft(((dictMonad["__superclass_Control.Bind.Bind_1"]())["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Control_Monad_State_Class.modify(dictMonadState)(v.value0))(v.value1);
              };
              throw new Error("Failed pattern match at Halogen.Query.StateF line 33, column 1 - line 33, column 40: " + [ v.constructor.name ]);
          };
      };
  };
  var mapState = function (v) {
      return function (v1) {
          return function (v2) {
              if (v2 instanceof Get) {
                  return new Get(function ($23) {
                      return v2.value0(v($23));
                  });
              };
              if (v2 instanceof Modify) {
                  return new Modify(v1(v2.value0), v2.value1);
              };
              throw new Error("Failed pattern match at Halogen.Query.StateF line 27, column 1 - line 27, column 37: " + [ v.constructor.name, v1.constructor.name, v2.constructor.name ]);
          };
      };
  };
  var functorStateF = new Data_Functor.Functor(function (f) {
      return function (v) {
          if (v instanceof Get) {
              return new Get(function ($24) {
                  return f(v.value0($24));
              });
          };
          if (v instanceof Modify) {
              return new Modify(v.value0, f(v.value1));
          };
          throw new Error("Failed pattern match at Halogen.Query.StateF line 21, column 3 - line 21, column 32: " + [ f.constructor.name, v.constructor.name ]);
      };
  });
  exports["Get"] = Get;
  exports["Modify"] = Modify;
  exports["mapState"] = mapState;
  exports["stateN"] = stateN;
  exports["functorStateF"] = functorStateF;
})(PS["Halogen.Query.StateF"] = PS["Halogen.Query.StateF"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Control_Alt = PS["Control.Alt"];
  var Control_Monad_Aff_Free = PS["Control.Monad.Aff.Free"];
  var Control_Monad_Free_Trans = PS["Control.Monad.Free.Trans"];
  var Control_Plus = PS["Control.Plus"];
  var Data_Bifunctor = PS["Data.Bifunctor"];
  var Data_Maybe = PS["Data.Maybe"];
  var Halogen_Query_EventSource = PS["Halogen.Query.EventSource"];
  var Halogen_Query_StateF = PS["Halogen.Query.StateF"];
  var Data_Functor = PS["Data.Functor"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Control_Coroutine_Stalling = PS["Control.Coroutine.Stalling"];        
  var Pending = (function () {
      function Pending() {

      };
      Pending.value = new Pending();
      return Pending;
  })();
  var Deferred = (function () {
      function Deferred() {

      };
      Deferred.value = new Deferred();
      return Deferred;
  })();
  var StateHF = (function () {
      function StateHF(value0) {
          this.value0 = value0;
      };
      StateHF.create = function (value0) {
          return new StateHF(value0);
      };
      return StateHF;
  })();
  var SubscribeHF = (function () {
      function SubscribeHF(value0, value1) {
          this.value0 = value0;
          this.value1 = value1;
      };
      SubscribeHF.create = function (value0) {
          return function (value1) {
              return new SubscribeHF(value0, value1);
          };
      };
      return SubscribeHF;
  })();
  var QueryHF = (function () {
      function QueryHF(value0) {
          this.value0 = value0;
      };
      QueryHF.create = function (value0) {
          return new QueryHF(value0);
      };
      return QueryHF;
  })();
  var RenderHF = (function () {
      function RenderHF(value0, value1) {
          this.value0 = value0;
          this.value1 = value1;
      };
      RenderHF.create = function (value0) {
          return function (value1) {
              return new RenderHF(value0, value1);
          };
      };
      return RenderHF;
  })();
  var RenderPendingHF = (function () {
      function RenderPendingHF(value0) {
          this.value0 = value0;
      };
      RenderPendingHF.create = function (value0) {
          return new RenderPendingHF(value0);
      };
      return RenderPendingHF;
  })();
  var HaltHF = (function () {
      function HaltHF(value0) {
          this.value0 = value0;
      };
      HaltHF.create = function (value0) {
          return new HaltHF(value0);
      };
      return HaltHF;
  })();
  var transformHF = function (dictFunctor) {
      return function (sigma) {
          return function (phi) {
              return function (gamma) {
                  return function (h) {
                      if (h instanceof StateHF) {
                          return new StateHF(sigma(h.value0));
                      };
                      if (h instanceof SubscribeHF) {
                          return new SubscribeHF(Control_Monad_Free_Trans.bimapFreeT(Control_Coroutine_Stalling.functorStallF)(dictFunctor)(Data_Bifunctor.lmap(Control_Coroutine_Stalling.bifunctorStallF)(phi))(gamma)(Halogen_Query_EventSource.runEventSource(h.value0)), h.value1);
                      };
                      if (h instanceof QueryHF) {
                          return new QueryHF(gamma(h.value0));
                      };
                      if (h instanceof RenderHF) {
                          return new RenderHF(h.value0, h.value1);
                      };
                      if (h instanceof RenderPendingHF) {
                          return new RenderPendingHF(h.value0);
                      };
                      if (h instanceof HaltHF) {
                          return new HaltHF(h.value0);
                      };
                      throw new Error("Failed pattern match at Halogen.Query.HalogenF line 65, column 3 - line 71, column 29: " + [ h.constructor.name ]);
                  };
              };
          };
      };
  };
  var hoistHalogenF = function (dictFunctor) {
      return function (eta) {
          return function (h) {
              if (h instanceof StateHF) {
                  return new StateHF(h.value0);
              };
              if (h instanceof SubscribeHF) {
                  return new SubscribeHF(Control_Monad_Free_Trans.hoistFreeT(Control_Coroutine_Stalling.functorStallF)(dictFunctor)(eta)(Halogen_Query_EventSource.runEventSource(h.value0)), h.value1);
              };
              if (h instanceof QueryHF) {
                  return new QueryHF(eta(h.value0));
              };
              if (h instanceof RenderHF) {
                  return new RenderHF(h.value0, h.value1);
              };
              if (h instanceof RenderPendingHF) {
                  return new RenderPendingHF(h.value0);
              };
              if (h instanceof HaltHF) {
                  return new HaltHF(h.value0);
              };
              throw new Error("Failed pattern match at Halogen.Query.HalogenF line 81, column 3 - line 87, column 26: " + [ h.constructor.name ]);
          };
      };
  };
  var functorHalogenF = function (dictFunctor) {
      return new Data_Functor.Functor(function (f) {
          return function (h) {
              if (h instanceof StateHF) {
                  return new StateHF(Data_Functor.map(Halogen_Query_StateF.functorStateF)(f)(h.value0));
              };
              if (h instanceof SubscribeHF) {
                  return new SubscribeHF(h.value0, f(h.value1));
              };
              if (h instanceof QueryHF) {
                  return new QueryHF(Data_Functor.map(dictFunctor)(f)(h.value0));
              };
              if (h instanceof RenderHF) {
                  return new RenderHF(h.value0, f(h.value1));
              };
              if (h instanceof RenderPendingHF) {
                  return new RenderPendingHF(Data_Functor.map(Data_Functor.functorFn)(f)(h.value0));
              };
              if (h instanceof HaltHF) {
                  return new HaltHF(h.value0);
              };
              throw new Error("Failed pattern match at Halogen.Query.HalogenF line 37, column 5 - line 43, column 31: " + [ h.constructor.name ]);
          };
      });
  };
  var affableHalogenF = function (dictAffable) {
      return new Control_Monad_Aff_Free.Affable(function ($38) {
          return QueryHF.create(Control_Monad_Aff_Free.fromAff(dictAffable)($38));
      });
  };
  exports["StateHF"] = StateHF;
  exports["SubscribeHF"] = SubscribeHF;
  exports["QueryHF"] = QueryHF;
  exports["RenderHF"] = RenderHF;
  exports["RenderPendingHF"] = RenderPendingHF;
  exports["HaltHF"] = HaltHF;
  exports["Pending"] = Pending;
  exports["Deferred"] = Deferred;
  exports["hoistHalogenF"] = hoistHalogenF;
  exports["transformHF"] = transformHF;
  exports["functorHalogenF"] = functorHalogenF;
  exports["affableHalogenF"] = affableHalogenF;
})(PS["Halogen.Query.HalogenF"] = PS["Halogen.Query.HalogenF"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Control_Monad_Free = PS["Control.Monad.Free"];
  var Halogen_Query_HalogenF = PS["Halogen.Query.HalogenF"];
  var Unsafe_Coerce = PS["Unsafe.Coerce"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];        
  var PostRender = (function () {
      function PostRender(value0) {
          this.value0 = value0;
      };
      PostRender.create = function (value0) {
          return new PostRender(value0);
      };
      return PostRender;
  })();
  var Finalized = (function () {
      function Finalized(value0) {
          this.value0 = value0;
      };
      Finalized.create = function (value0) {
          return new Finalized(value0);
      };
      return Finalized;
  })();
  var FinalizedF = (function () {
      function FinalizedF(value0, value1, value2) {
          this.value0 = value0;
          this.value1 = value1;
          this.value2 = value2;
      };
      FinalizedF.create = function (value0) {
          return function (value1) {
              return function (value2) {
                  return new FinalizedF(value0, value1, value2);
              };
          };
      };
      return FinalizedF;
  })();
  var runFinalized = function (k) {
      return function (f) {
          var $6 = Unsafe_Coerce.unsafeCoerce(f);
          return k($6.value0)($6.value1)($6.value2);
      };
  };
  var lmapHook = function (v) {
      return function (v1) {
          if (v1 instanceof PostRender) {
              return new PostRender(v(v1.value0));
          };
          if (v1 instanceof Finalized) {
              return new Finalized(v1.value0);
          };
          throw new Error("Failed pattern match at Halogen.Component.Hook line 55, column 1 - line 55, column 45: " + [ v.constructor.name, v1.constructor.name ]);
      };
  };
  var finalized = function (e) {
      return function (s) {
          return function (i) {
              return Unsafe_Coerce.unsafeCoerce(new FinalizedF(e, s, i));
          };
      };
  };
  var mapFinalized = function (dictFunctor) {
      return function (g) {
          return runFinalized(function (e) {
              return function (s) {
                  return function (i) {
                      return finalized(function ($18) {
                          return Control_Monad_Free.hoistFree(Halogen_Query_HalogenF.hoistHalogenF(dictFunctor)(g))(e($18));
                      })(s)(i);
                  };
              };
          });
      };
  };
  var rmapHook = function (dictFunctor) {
      return function (v) {
          return function (v1) {
              if (v1 instanceof Finalized) {
                  return new Finalized(mapFinalized(dictFunctor)(v)(v1.value0));
              };
              if (v1 instanceof PostRender) {
                  return new PostRender(v1.value0);
              };
              throw new Error("Failed pattern match at Halogen.Component.Hook line 64, column 1 - line 64, column 56: " + [ v.constructor.name, v1.constructor.name ]);
          };
      };
  };
  exports["PostRender"] = PostRender;
  exports["Finalized"] = Finalized;
  exports["finalized"] = finalized;
  exports["lmapHook"] = lmapHook;
  exports["mapFinalized"] = mapFinalized;
  exports["rmapHook"] = rmapHook;
  exports["runFinalized"] = runFinalized;
})(PS["Halogen.Component.Hook"] = PS["Halogen.Component.Hook"] || {});
(function(exports) {
  /* global exports */
  "use strict";

  // module Halogen.HTML.Events.Handler

  exports.preventDefaultImpl = function (e) {
    return function () {
      e.preventDefault();
    };
  };

  exports.stopPropagationImpl = function (e) {
    return function () {
      e.stopPropagation();
    };
  };

  exports.stopImmediatePropagationImpl = function (e) {
    return function () {
      e.stopImmediatePropagation();
    };
  };
})(PS["Halogen.HTML.Events.Handler"] = PS["Halogen.HTML.Events.Handler"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Halogen.HTML.Events.Handler"];
  var Prelude = PS["Prelude"];
  var Control_Apply = PS["Control.Apply"];
  var Control_Monad_Eff = PS["Control.Monad.Eff"];
  var Control_Monad_Eff_Class = PS["Control.Monad.Eff.Class"];
  var Control_Monad_Writer = PS["Control.Monad.Writer"];
  var Control_Monad_Writer_Class = PS["Control.Monad.Writer.Class"];
  var Data_Foldable = PS["Data.Foldable"];
  var Data_Tuple = PS["Data.Tuple"];
  var DOM = PS["DOM"];
  var Halogen_HTML_Events_Types = PS["Halogen.HTML.Events.Types"];
  var Data_Functor = PS["Data.Functor"];
  var Control_Applicative = PS["Control.Applicative"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Control_Bind = PS["Control.Bind"];
  var Control_Monad = PS["Control.Monad"];
  var Control_Monad_Writer_Trans = PS["Control.Monad.Writer.Trans"];
  var Data_Monoid = PS["Data.Monoid"];
  var Data_Identity = PS["Data.Identity"];
  var Data_Function = PS["Data.Function"];
  var Data_Semigroup = PS["Data.Semigroup"];        
  var PreventDefault = (function () {
      function PreventDefault() {

      };
      PreventDefault.value = new PreventDefault();
      return PreventDefault;
  })();
  var StopPropagation = (function () {
      function StopPropagation() {

      };
      StopPropagation.value = new StopPropagation();
      return StopPropagation;
  })();
  var StopImmediatePropagation = (function () {
      function StopImmediatePropagation() {

      };
      StopImmediatePropagation.value = new StopImmediatePropagation();
      return StopImmediatePropagation;
  })();
  var EventHandler = function (x) {
      return x;
  };                                                                                                                                                                                                      
  var runEventHandler = function (dictMonad) {
      return function (dictMonadEff) {
          return function (e) {
              return function (v) {
                  var applyUpdate = function (v1) {
                      if (v1 instanceof PreventDefault) {
                          return $foreign.preventDefaultImpl(e);
                      };
                      if (v1 instanceof StopPropagation) {
                          return $foreign.stopPropagationImpl(e);
                      };
                      if (v1 instanceof StopImmediatePropagation) {
                          return $foreign.stopImmediatePropagationImpl(e);
                      };
                      throw new Error("Failed pattern match at Halogen.HTML.Events.Handler line 89, column 3 - line 89, column 63: " + [ v1.constructor.name ]);
                  };
                  var $13 = Control_Monad_Writer.runWriter(v);
                  return Data_Function.apply(Control_Monad_Eff_Class.liftEff(dictMonadEff))(Control_Apply.applySecond(Control_Monad_Eff.applyEff)(Data_Foldable.for_(Control_Monad_Eff.applicativeEff)(Data_Foldable.foldableArray)($13.value1)(applyUpdate))(Control_Applicative.pure(Control_Monad_Eff.applicativeEff)($13.value0)));
              };
          };
      };
  };                                                                                                                                                                                  
  var functorEventHandler = new Data_Functor.Functor(function (f) {
      return function (v) {
          return Data_Functor.map(Control_Monad_Writer_Trans.functorWriterT(Data_Identity.functorIdentity))(f)(v);
      };
  });
  var applyEventHandler = new Control_Apply.Apply(function () {
      return functorEventHandler;
  }, function (v) {
      return function (v1) {
          return Control_Apply.apply(Control_Monad_Writer_Trans.applyWriterT(Data_Semigroup.semigroupArray)(Data_Identity.applyIdentity))(v)(v1);
      };
  });
  var applicativeEventHandler = new Control_Applicative.Applicative(function () {
      return applyEventHandler;
  }, function ($23) {
      return EventHandler(Control_Applicative.pure(Control_Monad_Writer_Trans.applicativeWriterT(Data_Monoid.monoidArray)(Data_Identity.applicativeIdentity))($23));
  });
  exports["runEventHandler"] = runEventHandler;
  exports["functorEventHandler"] = functorEventHandler;
  exports["applyEventHandler"] = applyEventHandler;
  exports["applicativeEventHandler"] = applicativeEventHandler;
})(PS["Halogen.HTML.Events.Handler"] = PS["Halogen.HTML.Events.Handler"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Data_Bifunctor = PS["Data.Bifunctor"];
  var Data_Exists = PS["Data.Exists"];
  var Data_ExistsR = PS["Data.ExistsR"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Traversable = PS["Data.Traversable"];
  var Data_Tuple = PS["Data.Tuple"];
  var DOM_HTML_Types = PS["DOM.HTML.Types"];
  var Halogen_HTML_Events_Handler = PS["Halogen.HTML.Events.Handler"];
  var Halogen_HTML_Events_Types = PS["Halogen.HTML.Events.Types"];
  var Data_Functor = PS["Data.Functor"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Data_Show = PS["Data.Show"];
  var Data_Function = PS["Data.Function"];
  var Control_Applicative = PS["Control.Applicative"];        
  var TagName = function (x) {
      return x;
  };
  var PropName = function (x) {
      return x;
  };
  var EventName = function (x) {
      return x;
  };
  var HandlerF = (function () {
      function HandlerF(value0, value1) {
          this.value0 = value0;
          this.value1 = value1;
      };
      HandlerF.create = function (value0) {
          return function (value1) {
              return new HandlerF(value0, value1);
          };
      };
      return HandlerF;
  })();
  var AttrName = function (x) {
      return x;
  };
  var PropF = (function () {
      function PropF(value0, value1, value2) {
          this.value0 = value0;
          this.value1 = value1;
          this.value2 = value2;
      };
      PropF.create = function (value0) {
          return function (value1) {
              return function (value2) {
                  return new PropF(value0, value1, value2);
              };
          };
      };
      return PropF;
  })();
  var Prop = (function () {
      function Prop(value0) {
          this.value0 = value0;
      };
      Prop.create = function (value0) {
          return new Prop(value0);
      };
      return Prop;
  })();
  var Attr = (function () {
      function Attr(value0, value1, value2) {
          this.value0 = value0;
          this.value1 = value1;
          this.value2 = value2;
      };
      Attr.create = function (value0) {
          return function (value1) {
              return function (value2) {
                  return new Attr(value0, value1, value2);
              };
          };
      };
      return Attr;
  })();
  var Key = (function () {
      function Key(value0) {
          this.value0 = value0;
      };
      Key.create = function (value0) {
          return new Key(value0);
      };
      return Key;
  })();
  var Handler = (function () {
      function Handler(value0) {
          this.value0 = value0;
      };
      Handler.create = function (value0) {
          return new Handler(value0);
      };
      return Handler;
  })();
  var Ref = (function () {
      function Ref(value0) {
          this.value0 = value0;
      };
      Ref.create = function (value0) {
          return new Ref(value0);
      };
      return Ref;
  })();
  var Text = (function () {
      function Text(value0) {
          this.value0 = value0;
      };
      Text.create = function (value0) {
          return new Text(value0);
      };
      return Text;
  })();
  var Element = (function () {
      function Element(value0, value1, value2, value3) {
          this.value0 = value0;
          this.value1 = value1;
          this.value2 = value2;
          this.value3 = value3;
      };
      Element.create = function (value0) {
          return function (value1) {
              return function (value2) {
                  return function (value3) {
                      return new Element(value0, value1, value2, value3);
                  };
              };
          };
      };
      return Element;
  })();
  var Slot = (function () {
      function Slot(value0) {
          this.value0 = value0;
      };
      Slot.create = function (value0) {
          return new Slot(value0);
      };
      return Slot;
  })();
  var IsProp = function (toPropString) {
      this.toPropString = toPropString;
  };
  var toPropString = function (dict) {
      return dict.toPropString;
  };
  var tagName = TagName;
  var stringIsProp = new IsProp(function (v) {
      return function (v1) {
          return function (s) {
              return s;
          };
      };
  });
  var runTagName = function (v) {
      return v;
  };
  var runPropName = function (v) {
      return v;
  };
  var runNamespace = function (v) {
      return v;
  };
  var runEventName = function (v) {
      return v;
  };
  var runAttrName = function (v) {
      return v;
  };
  var propName = PropName;
  var prop = function (dictIsProp) {
      return function (name) {
          return function (attr) {
              return function (v) {
                  return new Prop(Data_Exists.mkExists(new PropF(name, v, Data_Functor.map(Data_Maybe.functorMaybe)(Data_Function.flip(Data_Tuple.Tuple.create)(toPropString(dictIsProp)))(attr))));
              };
          };
      };
  }; 
  var handler = function (name) {
      return function (k) {
          return new Handler(Data_ExistsR.mkExistsR(new HandlerF(name, k)));
      };
  };
  var functorProp = new Data_Functor.Functor(function (v) {
      return function (v1) {
          if (v1 instanceof Prop) {
              return new Prop(v1.value0);
          };
          if (v1 instanceof Key) {
              return new Key(v1.value0);
          };
          if (v1 instanceof Attr) {
              return new Attr(v1.value0, v1.value1, v1.value2);
          };
          if (v1 instanceof Handler) {
              return Data_ExistsR.runExistsR(function (v2) {
                  return new Handler(Data_ExistsR.mkExistsR(new HandlerF(v2.value0, function ($61) {
                      return Data_Functor.map(Halogen_HTML_Events_Handler.functorEventHandler)(Data_Functor.map(Data_Maybe.functorMaybe)(v))(v2.value1($61));
                  })));
              })(v1.value0);
          };
          if (v1 instanceof Ref) {
              return new Ref(function ($62) {
                  return v(v1.value0($62));
              });
          };
          throw new Error("Failed pattern match at Halogen.HTML.Core line 98, column 3 - line 98, column 26: " + [ v.constructor.name, v1.constructor.name ]);
      };
  });
  var eventName = EventName;
  var element = Element.create(Data_Maybe.Nothing.value);
  var bifunctorHTML = new Data_Bifunctor.Bifunctor(function (f) {
      return function (g) {
          var go = function (v) {
              if (v instanceof Text) {
                  return new Text(v.value0);
              };
              if (v instanceof Element) {
                  return new Element(v.value0, v.value1, Data_Functor.map(Data_Functor.functorArray)(Data_Functor.map(functorProp)(g))(v.value2), Data_Functor.map(Data_Functor.functorArray)(go)(v.value3));
              };
              if (v instanceof Slot) {
                  return new Slot(f(v.value0));
              };
              throw new Error("Failed pattern match at Halogen.HTML.Core line 62, column 3 - line 66, column 29: " + [ v.constructor.name ]);
          };
          return go;
      };
  });                                                                            
  var attrName = AttrName;
  exports["Text"] = Text;
  exports["Element"] = Element;
  exports["Slot"] = Slot;
  exports["HandlerF"] = HandlerF;
  exports["Prop"] = Prop;
  exports["Attr"] = Attr;
  exports["Key"] = Key;
  exports["Handler"] = Handler;
  exports["Ref"] = Ref;
  exports["PropF"] = PropF;
  exports["IsProp"] = IsProp;
  exports["attrName"] = attrName;
  exports["element"] = element;
  exports["eventName"] = eventName;
  exports["handler"] = handler;
  exports["prop"] = prop;
  exports["propName"] = propName;
  exports["runAttrName"] = runAttrName;
  exports["runEventName"] = runEventName;
  exports["runNamespace"] = runNamespace;
  exports["runPropName"] = runPropName;
  exports["runTagName"] = runTagName;
  exports["tagName"] = tagName;
  exports["toPropString"] = toPropString;
  exports["bifunctorHTML"] = bifunctorHTML;
  exports["functorProp"] = functorProp;
  exports["stringIsProp"] = stringIsProp;
})(PS["Halogen.HTML.Core"] = PS["Halogen.HTML.Core"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Data_Bifunctor = PS["Data.Bifunctor"];
  var Data_Lazy = PS["Data.Lazy"];
  var Halogen_HTML_Core = PS["Halogen.HTML.Core"];
  var Unsafe_Coerce = PS["Unsafe.Coerce"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Data_Unit = PS["Data.Unit"];
  var Data_Eq = PS["Data.Eq"];
  var Data_Functor = PS["Data.Functor"];
  var Control_Category = PS["Control.Category"];        
  var runTree = function (k) {
      return function (t) {
          var $5 = Unsafe_Coerce.unsafeCoerce(t);
          return k($5);
      };
  };
  var mkTree$prime = Unsafe_Coerce.unsafeCoerce;
  var thunkTree = runTree(function ($12) {
      return mkTree$prime((function (v) {
          var $6 = {};
          for (var $7 in v) {
              if (v.hasOwnProperty($7)) {
                  $6[$7] = v[$7];
              };
          };
          $6.thunk = true;
          return $6;
      })($12));
  });
  var mkTree = function (dictEq) {
      return function (html) {
          return mkTree$prime({
              slot: Data_Unit.unit, 
              html: html, 
              eq: Data_Eq.eq(dictEq), 
              thunk: false
          });
      };
  };
  var graftTree = function (l) {
      return function (r) {
          return runTree(function (t) {
              return mkTree$prime({
                  slot: r(t.slot), 
                  html: Data_Functor.map(Data_Lazy.functorLazy)(Data_Bifunctor.bimap(Halogen_HTML_Core.bifunctorHTML)(graftTree(l)(Control_Category.id(Control_Category.categoryFn)))(l))(t.html), 
                  eq: t.eq, 
                  thunk: t.thunk
              });
          });
      };
  };
  var emptyTree = mkTree$prime({
      slot: Data_Unit.unit, 
      html: Data_Lazy.defer(function (v) {
          return new Halogen_HTML_Core.Text("");
      }), 
      eq: function (v) {
          return function (v1) {
              return false;
          };
      }, 
      thunk: false
  });
  exports["emptyTree"] = emptyTree;
  exports["graftTree"] = graftTree;
  exports["mkTree"] = mkTree;
  exports["mkTree'"] = mkTree$prime;
  exports["runTree"] = runTree;
  exports["thunkTree"] = thunkTree;
})(PS["Halogen.Component.Tree"] = PS["Halogen.Component.Tree"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Control_Monad_Aff_Free = PS["Control.Monad.Aff.Free"];
  var Control_Monad_Free = PS["Control.Monad.Free"];
  var Halogen_Query_EventSource = PS["Halogen.Query.EventSource"];
  var Halogen_Query_HalogenF = PS["Halogen.Query.HalogenF"];
  var Halogen_Query_StateF = PS["Halogen.Query.StateF"];
  var Data_Unit = PS["Data.Unit"];
  var Control_Category = PS["Control.Category"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Data_Function = PS["Data.Function"];
  var request = function (req) {
      return req(Control_Category.id(Control_Category.categoryFn));
  };
  var modify = function (f) {
      return Control_Monad_Free.liftF(new Halogen_Query_HalogenF.StateHF(new Halogen_Query_StateF.Modify(f, Data_Unit.unit)));
  };
  var set = function ($0) {
      return modify(Data_Function["const"]($0));
  };
  var liftH = function ($1) {
      return Control_Monad_Free.liftF(Halogen_Query_HalogenF.QueryHF.create($1));
  };
  var gets = function ($2) {
      return Control_Monad_Free.liftF(Halogen_Query_HalogenF.StateHF.create(Halogen_Query_StateF.Get.create($2)));
  };
  var get = gets(Control_Category.id(Control_Category.categoryFn));
  var action = function (act) {
      return act(Data_Unit.unit);
  };
  exports["action"] = action;
  exports["get"] = get;
  exports["gets"] = gets;
  exports["liftH"] = liftH;
  exports["modify"] = modify;
  exports["request"] = request;
  exports["set"] = set;
})(PS["Halogen.Query"] = PS["Halogen.Query"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Control_Monad_Eff = PS["Control.Monad.Eff"];
  var Control_Monad_Free = PS["Control.Monad.Free"];
  var Control_Monad_Free_Trans = PS["Control.Monad.Free.Trans"];
  var Control_Monad_ST = PS["Control.Monad.ST"];
  var Data_Array = PS["Data.Array"];
  var Data_Array_ST = PS["Data.Array.ST"];
  var Data_Bifunctor = PS["Data.Bifunctor"];
  var Data_Foldable = PS["Data.Foldable"];
  var Data_Functor_Coproduct = PS["Data.Functor.Coproduct"];
  var Data_Lazy = PS["Data.Lazy"];
  var Data_List = PS["Data.List"];
  var Data_Map = PS["Data.Map"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Traversable = PS["Data.Traversable"];
  var Data_Tuple = PS["Data.Tuple"];
  var Halogen_Component_ChildPath = PS["Halogen.Component.ChildPath"];
  var Halogen_Component_Hook = PS["Halogen.Component.Hook"];
  var Halogen_Component_Tree = PS["Halogen.Component.Tree"];
  var Halogen_HTML_Core = PS["Halogen.HTML.Core"];
  var Halogen_Query = PS["Halogen.Query"];
  var Halogen_Query_EventSource = PS["Halogen.Query.EventSource"];
  var Halogen_Query_HalogenF = PS["Halogen.Query.HalogenF"];
  var Halogen_Query_StateF = PS["Halogen.Query.StateF"];
  var Partial_Unsafe = PS["Partial.Unsafe"];
  var Unsafe_Coerce = PS["Unsafe.Coerce"];
  var Data_Functor = PS["Data.Functor"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Data_Function = PS["Data.Function"];
  var Control_Category = PS["Control.Category"];
  var Control_Coroutine_Stalling = PS["Control.Coroutine.Stalling"];
  var Data_Unit = PS["Data.Unit"];
  var Data_Semigroup = PS["Data.Semigroup"];
  var Data_Monoid = PS["Data.Monoid"];
  var Control_Bind = PS["Control.Bind"];
  var Control_Applicative = PS["Control.Applicative"];
  var Control_Apply = PS["Control.Apply"];
  var SlotConstructor = (function () {
      function SlotConstructor(value0, value1) {
          this.value0 = value0;
          this.value1 = value1;
      };
      SlotConstructor.create = function (value0) {
          return function (value1) {
              return new SlotConstructor(value0, value1);
          };
      };
      return SlotConstructor;
  })();
  var ChildF = (function () {
      function ChildF(value0, value1) {
          this.value0 = value0;
          this.value1 = value1;
      };
      ChildF.create = function (value0) {
          return function (value1) {
              return new ChildF(value0, value1);
          };
      };
      return ChildF;
  })();
  var renderComponent = function (v) {
      return v.render;
  };
  var queryComponent = function (v) {
      return v["eval"];
  };
  var parentState = function (st) {
      return {
          parent: st, 
          children: Data_Map.empty
      };
  };
  var mapStateFParent = Halogen_Query_StateF.mapState(function (v) {
      return v.parent;
  })(function (f) {
      return function (v) {
          return {
              parent: f(v.parent), 
              children: v.children
          };
      };
  });
  var mergeParentStateF = function ($188) {
      return Control_Monad_Free.liftF(Halogen_Query_HalogenF.StateHF.create(mapStateFParent($188)));
  };
  var mapStateFChild = function (dictOrd) {
      return function (p) {
          return Halogen_Query_StateF.mapState(function (v) {
              return Data_Function.apply(Partial_Unsafe.unsafePartial(function (dictPartial) {
                  return Data_Maybe.fromJust(dictPartial);
              }))(Data_Functor.map(Data_Maybe.functorMaybe)(function (v1) {
                  return v1.state;
              })(Data_Map.lookup(dictOrd)(p)(v.children)));
          })(function (f) {
              return function (v) {
                  return {
                      parent: v.parent, 
                      children: Data_Map.update(dictOrd)(function (child) {
                          return new Data_Maybe.Just({
                              component: child.component, 
                              state: f(child.state), 
                              memo: Data_Maybe.Nothing.value
                          });
                      })(p)(v.children)
                  };
              };
          });
      };
  };
  var liftQuery = Halogen_Query.liftH;
  var liftChildF = function (dictFunctor) {
      return Control_Monad_Free.hoistFree(Halogen_Query_HalogenF.transformHF(dictFunctor)(Control_Category.id(Control_Category.categoryFn))(Data_Functor_Coproduct.right)(Control_Category.id(Control_Category.categoryFn)));
  };
  var queryParent = function (dictFunctor) {
      return function (f) {
          return function ($189) {
              return Control_Monad_Free.foldFree(Control_Monad_Free.freeMonadRec)(function (h) {
                  if (h instanceof Halogen_Query_HalogenF.StateHF) {
                      return mergeParentStateF(h.value0);
                  };
                  if (h instanceof Halogen_Query_HalogenF.SubscribeHF) {
                      return Data_Function.apply(Control_Monad_Free.liftF)(new Halogen_Query_HalogenF.SubscribeHF(Control_Monad_Free_Trans.interpret(Control_Coroutine_Stalling.functorStallF)(dictFunctor)(Data_Bifunctor.lmap(Control_Coroutine_Stalling.bifunctorStallF)(Data_Functor_Coproduct.left))(Halogen_Query_EventSource.runEventSource(Halogen_Query_EventSource.fromParentEventSource(h.value0))), h.value1));
                  };
                  if (h instanceof Halogen_Query_HalogenF.QueryHF) {
                      return liftChildF(dictFunctor)(h.value0);
                  };
                  if (h instanceof Halogen_Query_HalogenF.RenderHF) {
                      return Data_Function.apply(Control_Monad_Free.liftF)(new Halogen_Query_HalogenF.RenderHF(h.value0, h.value1));
                  };
                  if (h instanceof Halogen_Query_HalogenF.RenderPendingHF) {
                      return Data_Function.apply(Control_Monad_Free.liftF)(new Halogen_Query_HalogenF.RenderPendingHF(h.value0));
                  };
                  if (h instanceof Halogen_Query_HalogenF.HaltHF) {
                      return Data_Function.apply(Control_Monad_Free.liftF)(new Halogen_Query_HalogenF.HaltHF(h.value0));
                  };
                  throw new Error("Failed pattern match at Halogen.Component line 487, column 5 - line 494, column 39: " + [ h.constructor.name ]);
              })(f($189));
          };
      };
  };
  var lifecycleComponent = function (spec) {
      var renderTree = function (html) {
          return Halogen_Component_Tree["mkTree'"]({
              slot: Data_Unit.unit, 
              html: Data_Lazy.defer(function (v) {
                  return Unsafe_Coerce.unsafeCoerce(html);
              }), 
              eq: function (v) {
                  return function (v1) {
                      return false;
                  };
              }, 
              thunk: false
          });
      };
      return {
          render: function (s) {
              return {
                  state: s, 
                  hooks: [  ], 
                  tree: renderTree(spec.render(s))
              };
          }, 
          "eval": spec["eval"], 
          initializer: spec.initializer, 
          finalizers: function (s) {
              return Data_Maybe.maybe([  ])(function (i) {
                  return [ Halogen_Component_Hook.finalized(spec["eval"])(s)(i) ];
              })(spec.finalizer);
          }
      };
  };
  var interpret = function (dictFunctor) {
      return function (nat) {
          return function (v) {
              var render$prime = function (st) {
                  var $102 = v.render(st);
                  return {
                      state: $102.state, 
                      hooks: Data_Functor.map(Data_Functor.functorArray)(Halogen_Component_Hook.rmapHook(dictFunctor)(nat))($102.hooks), 
                      tree: $102.tree
                  };
              };
              return {
                  render: render$prime, 
                  "eval": function ($190) {
                      return Control_Monad_Free.hoistFree(Halogen_Query_HalogenF.hoistHalogenF(dictFunctor)(nat))(v["eval"]($190));
                  }, 
                  initializer: v.initializer, 
                  finalizers: Data_Functor.map(Data_Functor.functorFn)(Data_Functor.map(Data_Functor.functorArray)(Halogen_Component_Hook.mapFinalized(dictFunctor)(nat)))(v.finalizers)
              };
          };
      };
  };
  var initializeComponent = function (v) {
      return v.initializer;
  };
  var finalizeComponent = function (v) {
      return v.finalizers;
  };
  var parentFinalizers = function ($$eval) {
      return function (fin) {
          return function (v) {
              var parentFin = function (i) {
                  return [ Halogen_Component_Hook.finalized($$eval)(parentState(v.parent))(Data_Functor_Coproduct.left(i)) ];
              };
              var childFin = function (child) {
                  return finalizeComponent(child.component)(child.state);
              };
              return Data_Semigroup.append(Data_Semigroup.semigroupArray)(Data_Foldable.foldMap(Data_Map.foldableMap)(Data_Monoid.monoidArray)(childFin)(v.children))(Data_Foldable.foldMap(Data_Foldable.foldableMaybe)(Data_Monoid.monoidArray)(parentFin)(fin));
          };
      };
  };
  var renderParent = function (dictOrd) {
      return function (render) {
          return function (v) {
              var installChild = function (v1) {
                  return function (v2) {
                      var update = function (hs) {
                          return function (c) {
                              return {
                                  children: Data_Map.insert(dictOrd)(v1.value0)(c)(v2.children), 
                                  removed: Data_Map["delete"](dictOrd)(v1.value0)(v2.removed), 
                                  hooks: Data_Semigroup.append(Data_Semigroup.semigroupArray)(v2.hooks)(hs)
                              };
                          };
                      };
                      var renderChild = function (v3) {
                          return function (v4) {
                              if (v4.memo instanceof Data_Maybe.Just) {
                                  return new Data_Tuple.Tuple(Data_Function.apply(Halogen_HTML_Core.Slot.create)(Halogen_Component_Tree.thunkTree(v4.memo.value0)), update([  ])(v4));
                              };
                              var r = renderComponent(v4.component)(v4.state);
                              var adapt = function (a) {
                                  return Data_Functor_Coproduct.right(new ChildF(v1.value0, a));
                              };
                              var hooks$prime = Data_Functor.map(Data_Functor.functorArray)(Halogen_Component_Hook.lmapHook(adapt))(Data_Maybe.maybe(r.hooks)(Data_Function.flip(Data_Array.cons)(r.hooks))(v3));
                              var tree = Halogen_Component_Tree.graftTree(adapt)(Data_Function["const"](v1.value0))(r.tree);
                              return Data_Function.apply(Data_Tuple.Tuple.create(new Halogen_HTML_Core.Slot(tree)))(update(hooks$prime)({
                                  component: v4.component, 
                                  state: r.state, 
                                  memo: new Data_Maybe.Just(tree)
                              }));
                          };
                      };
                      var $123 = Data_Map.lookup(dictOrd)(v1.value0)(v.children);
                      if ($123 instanceof Data_Maybe.Just) {
                          return renderChild(Data_Maybe.Nothing.value)($123.value0);
                      };
                      if ($123 instanceof Data_Maybe.Nothing) {
                          var def$prime = v1.value1(Data_Unit.unit);
                          var hook = Data_Functor.map(Data_Maybe.functorMaybe)(Halogen_Component_Hook.PostRender.create)(initializeComponent(def$prime.component));
                          return renderChild(hook)({
                              component: def$prime.component, 
                              state: def$prime.initialState, 
                              memo: Data_Maybe.Nothing.value
                          });
                      };
                      throw new Error("Failed pattern match at Halogen.Component line 442, column 5 - line 454, column 16: " + [ $123.constructor.name ]);
                  };
              };
              var install = function (v1) {
                  return function (st) {
                      if (v1 instanceof Halogen_HTML_Core.Text) {
                          return new Data_Tuple.Tuple(new Halogen_HTML_Core.Text(v1.value0), st);
                      };
                      if (v1 instanceof Halogen_HTML_Core.Slot) {
                          return installChild(v1.value0)(st);
                      };
                      if (v1 instanceof Halogen_HTML_Core.Element) {
                          return Data_Function.apply(Control_Monad_Eff.runPure)(function __do() {
                              var v2 = Data_Array_ST.emptySTArray();
                              var v3 = {
                                  value: st
                              };
                              Control_Monad_Eff.foreachE(v1.value3)(function (el) {
                                  return function __do() {
                                      var $137 = install(el)(v3.value);
                                      Data_Function.apply(Data_Functor["void"](Control_Monad_Eff.functorEff))(Data_Array_ST.pushSTArray(v2)($137.value0))();
                                      return Data_Function.apply(Data_Functor["void"](Control_Monad_Eff.functorEff))(Control_Monad_ST.writeSTRef(v3)($137.value1))();
                                  };
                              })();
                              return Data_Function.apply(Control_Applicative.pure(Control_Monad_Eff.applicativeEff))(new Data_Tuple.Tuple(Data_Function.apply(Halogen_HTML_Core.Element.create(v1.value0)(v1.value1)(Data_Functor.map(Data_Functor.functorArray)(Data_Functor.map(Halogen_HTML_Core.functorProp)(Data_Functor_Coproduct.left))(v1.value2)))(Unsafe_Coerce.unsafeCoerce(v2)), v3.value))();
                          });
                      };
                      throw new Error("Failed pattern match at Halogen.Component line 404, column 1 - line 477, column 14: " + [ v1.constructor.name, st.constructor.name ]);
                  };
              };
              var init = {
                  children: Data_Map.empty, 
                  removed: v.children, 
                  hooks: [  ]
              };
              var finalizeChild = function (child) {
                  return Data_Function.apply(Data_Functor.map(Data_Functor.functorArray)(Halogen_Component_Hook.Finalized.create))(finalizeComponent(child.component)(child.state));
              };
              var $145 = install(render(v.parent))(init);
              return {
                  state: {
                      parent: v.parent, 
                      children: $145.value1.children
                  }, 
                  hooks: Data_Semigroup.append(Data_Semigroup.semigroupArray)(Data_Foldable.foldMap(Data_Map.foldableMap)(Data_Monoid.monoidArray)(finalizeChild)($145.value1.removed))($145.value1.hooks), 
                  tree: Data_Function.apply(Halogen_Component_Tree.mkTree(dictOrd["__superclass_Data.Eq.Eq_0"]()))(Data_Lazy.defer(function (v1) {
                      return $145.value0;
                  }))
              };
          };
      };
  };
  var emptyResult = function (state) {
      return {
          state: state, 
          hooks: [  ], 
          tree: Halogen_Component_Tree.emptyTree
      };
  };
  var transform = function (dictFunctor) {
      return function (reviewS) {
          return function (previewS) {
              return function (reviewQ) {
                  return function (previewQ) {
                      return function (v) {
                          var render$prime = function (st) {
                              var $154 = v.render(st);
                              return {
                                  state: reviewS($154.state), 
                                  hooks: Data_Functor.map(Data_Functor.functorArray)(Halogen_Component_Hook.lmapHook(reviewQ))($154.hooks), 
                                  tree: Halogen_Component_Tree.graftTree(reviewQ)(Control_Category.id(Control_Category.categoryFn))($154.tree)
                              };
                          };
                          var modifyState = function (f) {
                              return function (s$prime) {
                                  return Data_Maybe.maybe(s$prime)(function ($191) {
                                      return reviewS(f($191));
                                  })(previewS(s$prime));
                              };
                          };
                          var go = function (v1) {
                              if (v1 instanceof Halogen_Query_HalogenF.StateHF && v1.value0 instanceof Halogen_Query_StateF.Get) {
                                  return Control_Bind.bindFlipped(Control_Monad_Free.freeBind)(function ($192) {
                                      return Control_Monad_Free.liftF(Data_Maybe.maybe(new Halogen_Query_HalogenF.HaltHF("state prism failed in `transform`"))(function (st$prime) {
                                          return new Halogen_Query_HalogenF.StateHF(new Halogen_Query_StateF.Get(function ($193) {
                                              return v1.value0.value0(Data_Function["const"](st$prime)($193));
                                          }));
                                      })(previewS($192)));
                                  })(Halogen_Query.get);
                              };
                              if (v1 instanceof Halogen_Query_HalogenF.StateHF && v1.value0 instanceof Halogen_Query_StateF.Modify) {
                                  return Data_Function.apply(Control_Monad_Free.liftF)(new Halogen_Query_HalogenF.StateHF(new Halogen_Query_StateF.Modify(modifyState(v1.value0.value0), v1.value0.value1)));
                              };
                              if (v1 instanceof Halogen_Query_HalogenF.SubscribeHF) {
                                  return Data_Function.apply(Control_Monad_Free.liftF)(new Halogen_Query_HalogenF.SubscribeHF(Control_Monad_Free_Trans.interpret(Control_Coroutine_Stalling.functorStallF)(dictFunctor)(Data_Bifunctor.lmap(Control_Coroutine_Stalling.bifunctorStallF)(reviewQ))(Halogen_Query_EventSource.runEventSource(v1.value0)), v1.value1));
                              };
                              if (v1 instanceof Halogen_Query_HalogenF.QueryHF) {
                                  return Data_Function.apply(Control_Monad_Free.liftF)(new Halogen_Query_HalogenF.QueryHF(v1.value0));
                              };
                              if (v1 instanceof Halogen_Query_HalogenF.RenderHF) {
                                  return Data_Function.apply(Control_Monad_Free.liftF)(new Halogen_Query_HalogenF.RenderHF(v1.value0, v1.value1));
                              };
                              if (v1 instanceof Halogen_Query_HalogenF.RenderPendingHF) {
                                  return Data_Function.apply(Control_Monad_Free.liftF)(new Halogen_Query_HalogenF.RenderPendingHF(v1.value0));
                              };
                              if (v1 instanceof Halogen_Query_HalogenF.HaltHF) {
                                  return Data_Function.apply(Control_Monad_Free.liftF)(new Halogen_Query_HalogenF.HaltHF(v1.value0));
                              };
                              throw new Error("Failed pattern match at Halogen.Component line 558, column 3 - line 564, column 12: " + [ v1.constructor.name ]);
                          };
                          return {
                              render: function (st) {
                                  return Data_Maybe.maybe(emptyResult(st))(render$prime)(previewS(st));
                              }, 
                              "eval": function ($194) {
                                  return Data_Maybe.maybe(Control_Monad_Free.liftF(new Halogen_Query_HalogenF.HaltHF("query prism failed in `transform`")))(function ($195) {
                                      return Control_Monad_Free.foldFree(Control_Monad_Free.freeMonadRec)(go)(v["eval"]($195));
                                  })(previewQ($194));
                              }, 
                              initializer: Data_Functor.map(Data_Maybe.functorMaybe)(reviewQ)(v.initializer), 
                              finalizers: function ($196) {
                                  return Data_Maybe.maybe([  ])(v.finalizers)(previewS($196));
                              }
                          };
                      };
                  };
              };
          };
      };
  };
  var transformChild = function (dictFunctor) {
      return function (i) {
          return transform(dictFunctor)(Halogen_Component_ChildPath.injState(i))(Halogen_Component_ChildPath.prjState(i))(Halogen_Component_ChildPath.injQuery(i))(Halogen_Component_ChildPath.prjQuery(i));
      };
  };
  var component = function (spec) {
      return lifecycleComponent({
          render: spec.render, 
          "eval": spec["eval"], 
          initializer: Data_Maybe.Nothing.value, 
          finalizer: Data_Maybe.Nothing.value
      });
  };
  var bracketQuery = function (f) {
      return Control_Bind.bind(Control_Monad_Free.freeBind)(Control_Monad_Free.liftF(new Halogen_Query_HalogenF.RenderPendingHF(Control_Category.id(Control_Category.categoryFn))))(function (v) {
          return Control_Bind.bind(Control_Monad_Free.freeBind)((function () {
              if (v instanceof Data_Maybe.Just && v.value0 instanceof Halogen_Query_HalogenF.Pending) {
                  return Control_Monad_Free.liftF(new Halogen_Query_HalogenF.RenderHF(Data_Maybe.Nothing.value, Data_Unit.unit));
              };
              return Control_Applicative.pure(Control_Monad_Free.freeApplicative)(Data_Unit.unit);
          })())(function () {
              return Control_Bind.bind(Control_Monad_Free.freeBind)(f)(function (v1) {
                  return Control_Bind.bind(Control_Monad_Free.freeBind)(Control_Monad_Free.liftF(new Halogen_Query_HalogenF.RenderPendingHF(Control_Category.id(Control_Category.categoryFn))))(function (v2) {
                      return Control_Bind.bind(Control_Monad_Free.freeBind)(Data_Foldable.for_(Control_Monad_Free.freeApplicative)(Data_Foldable.foldableMaybe)(v)(function (v3) {
                          return Control_Monad_Free.liftF(new Halogen_Query_HalogenF.RenderHF(new Data_Maybe.Just(Halogen_Query_HalogenF.Deferred.value), Data_Unit.unit));
                      }))(function () {
                          return Control_Applicative.pure(Control_Monad_Free.freeApplicative)(v1);
                      });
                  });
              });
          });
      });
  };
  var mkQuery = function (dictFunctor) {
      return function (dictOrd) {
          return function (p) {
              return function (q) {
                  return bracketQuery(Control_Bind.bind(Control_Monad_Free.freeBind)(Halogen_Query.get)(function (v) {
                      return Data_Traversable["for"](Control_Monad_Free.freeApplicative)(Data_Traversable.traversableMaybe)(Data_Map.lookup(dictOrd)(p)(v.children))(function (child) {
                          return Control_Monad_Free.hoistFree(Halogen_Query_HalogenF.transformHF(dictFunctor)(mapStateFChild(dictOrd)(p))(ChildF.create(p))(Control_Category.id(Control_Category.categoryFn)))(queryComponent(child.component)(q));
                      });
                  }));
              };
          };
      };
  };
  var mkQuery$prime = function (dictFunctor) {
      return function (dictOrd) {
          return function (i) {
              return function (p) {
                  return function (q) {
                      return mkQuery(dictFunctor)(dictOrd)(Halogen_Component_ChildPath.injSlot(i)(p))(Halogen_Component_ChildPath.injQuery(i)(q));
                  };
              };
          };
      };
  };
  var query$prime = function (dictFunctor) {
      return function (dictOrd) {
          return function (i) {
              return function (p) {
                  return function (q) {
                      return liftQuery(mkQuery$prime(dictFunctor)(dictOrd)(i)(p)(q));
                  };
              };
          };
      };
  };
  var queryChild = function (dictFunctor) {
      return function (dictOrd) {
          return function (v) {
              return Control_Bind.bindFlipped(Control_Monad_Free.freeBind)(Data_Maybe.maybe(Control_Monad_Free.liftF(new Halogen_Query_HalogenF.HaltHF("`queryChild` failed")))(Control_Applicative.pure(Control_Monad_Free.freeApplicative)))(Control_Monad_Free.hoistFree(Halogen_Query_HalogenF.transformHF(dictFunctor)(Control_Category.id(Control_Category.categoryFn))(Data_Functor_Coproduct.right)(Control_Category.id(Control_Category.categoryFn)))(mkQuery(dictFunctor)(dictOrd)(v.value0)(v.value1)));
          };
      };
  };
  var lifecycleParentComponent = function (dictFunctor) {
      return function (dictOrd) {
          return function (spec) {
              var $$eval = Data_Functor_Coproduct.coproduct(queryParent(dictFunctor)(spec["eval"]))((function () {
                  if (spec.peek instanceof Data_Maybe.Nothing) {
                      return queryChild(dictFunctor)(dictOrd);
                  };
                  if (spec.peek instanceof Data_Maybe.Just) {
                      return function (q) {
                          return Control_Apply.applyFirst(Control_Monad_Free.freeApply)(queryChild(dictFunctor)(dictOrd)(q))(queryParent(dictFunctor)(spec.peek.value0)(q));
                      };
                  };
                  throw new Error("Failed pattern match at Halogen.Component line 205, column 10 - line 207, column 58: " + [ spec.peek.constructor.name ]);
              })());
              return {
                  render: renderParent(dictOrd)(spec.render), 
                  "eval": $$eval, 
                  initializer: Data_Functor.map(Data_Maybe.functorMaybe)(Data_Functor_Coproduct.left)(spec.initializer), 
                  finalizers: parentFinalizers($$eval)(spec.finalizer)
              };
          };
      };
  };
  var parentComponent = function (dictFunctor) {
      return function (dictOrd) {
          return function (spec) {
              return lifecycleParentComponent(dictFunctor)(dictOrd)({
                  render: spec.render, 
                  "eval": spec["eval"], 
                  peek: spec.peek, 
                  initializer: Data_Maybe.Nothing.value, 
                  finalizer: Data_Maybe.Nothing.value
              });
          };
      };
  };
  exports["ChildF"] = ChildF;
  exports["SlotConstructor"] = SlotConstructor;
  exports["component"] = component;
  exports["finalizeComponent"] = finalizeComponent;
  exports["initializeComponent"] = initializeComponent;
  exports["interpret"] = interpret;
  exports["lifecycleComponent"] = lifecycleComponent;
  exports["lifecycleParentComponent"] = lifecycleParentComponent;
  exports["liftQuery"] = liftQuery;
  exports["mkQuery"] = mkQuery;
  exports["parentComponent"] = parentComponent;
  exports["parentState"] = parentState;
  exports["query'"] = query$prime;
  exports["queryComponent"] = queryComponent;
  exports["renderComponent"] = renderComponent;
  exports["transform"] = transform;
  exports["transformChild"] = transformChild;
})(PS["Halogen.Component"] = PS["Halogen.Component"] || {});
(function(exports) {
  /* global exports, require */
  "use strict";
  var vcreateElement =require("virtual-dom/create-element");
  var vdiff =require("virtual-dom/diff");
  var vpatch =require("virtual-dom/patch");
  var VText =require("virtual-dom/vnode/vtext");
  var VirtualNode =require("virtual-dom/vnode/vnode");
  var SoftSetHook =require("virtual-dom/virtual-hyperscript/hooks/soft-set-hook"); 

  // jshint maxparams: 2
  exports.prop = function (key, value) {
    var props = {};
    props[key] = value;
    return props;
  };

  // jshint maxparams: 2
  exports.attr = function (key, value) {
    var props = { attributes: {} };
    props.attributes[key] = value;
    return props;
  };

  function HandlerHook (key, f) {
    this.key = key;
    this.callback = function (e) {
      f(e)();
    };
  }

  HandlerHook.prototype = {
    hook: function (node) {
      node.addEventListener(this.key, this.callback);
    },
    unhook: function (node) {
      node.removeEventListener(this.key, this.callback);
    }
  };

  // jshint maxparams: 2
  exports.handlerProp = function (key, f) {
    var props = {};
    props["halogen-hook-" + key] = new HandlerHook(key, f);
    return props;
  };

  exports.refPropImpl = function (nothing) {
    return function (just) {

      var ifHookFn = function (init) {
        // jshint maxparams: 3
        return function (node, prop, diff) {
          // jshint validthis: true
          if (typeof diff === "undefined") {
            this.f(init ? just(node) : nothing)();
          }
        };
      };

      // jshint maxparams: 1
      function RefHook (f) {
        this.f = f;
      }

      RefHook.prototype = {
        hook: ifHookFn(true),
        unhook: ifHookFn(false)
      };

      return function (f) {
        return { "halogen-ref": new RefHook(f) };
      };
    };
  };

  // jshint maxparams: 3
  function HalogenWidget (tree, eq, render) {
    this.tree = tree;
    this.eq = eq;
    this.render = render;
    this.vdom = null;
    this.el = null;
  }

  HalogenWidget.prototype = {
    type: "Widget",
    init: function () {
      this.vdom = this.render(this.tree);
      this.el = vcreateElement(this.vdom);
      return this.el;
    },
    update: function (prev, node) {
      if (!prev.tree || !this.eq(prev.tree.slot)(this.tree.slot)) {
        return this.init();
      }
      if (this.tree.thunk) {
        this.vdom = prev.vdom;
        this.el = prev.el;
      } else {
        this.vdom = this.render(this.tree);
        this.el = vpatch(node, vdiff(prev.vdom, this.vdom));
      }
    }
  };

  exports.widget = function (tree) {
    return function (eq) {
      return function (render) {
        return new HalogenWidget(tree, eq, render);
      };
    };
  };

  exports.concatProps = function () {
    // jshint maxparams: 2
    var hOP = Object.prototype.hasOwnProperty;
    var copy = function (props, result) {
      for (var key in props) {
        if (hOP.call(props, key)) {
          if (key === "attributes") {
            var attrs = props[key];
            var resultAttrs = result[key] || (result[key] = {});
            for (var attr in attrs) {
              if (hOP.call(attrs, attr)) {
                resultAttrs[attr] = attrs[attr];
              }
            }
          } else {
            result[key] = props[key];
          }
        }
      }
      return result;
    };
    return function (p1, p2) {
      return copy(p2, copy(p1, {}));
    };
  }();

  exports.emptyProps = {};

  exports.createElement = function (vtree) {
    return vcreateElement(vtree);
  };

  exports.diff = function (vtree1) {
    return function (vtree2) {
      return vdiff(vtree1, vtree2);
    };
  };

  exports.patch = function (p) {
    return function (node) {
      return function () {
        return vpatch(node, p);
      };
    };
  };

  exports.vtext = function (s) {
    return new VText(s);
  };

  exports.vnode = function (namespace) {
    return function (name) {
      return function (key) {
        return function (props) {
          return function (children) {
            if (name === "input" && props.value !== undefined) {
              props.value = new SoftSetHook(props.value);
            }
            return new VirtualNode(name, props, children, key, namespace);
          };
        };
      };
    };
  };
})(PS["Halogen.Internal.VirtualDOM"] = PS["Halogen.Internal.VirtualDOM"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Halogen.Internal.VirtualDOM"];
  var Prelude = PS["Prelude"];
  var Control_Monad_Eff = PS["Control.Monad.Eff"];
  var Data_Monoid = PS["Data.Monoid"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Nullable = PS["Data.Nullable"];
  var Data_Function_Uncurried = PS["Data.Function.Uncurried"];
  var DOM = PS["DOM"];
  var DOM_HTML_Types = PS["DOM.HTML.Types"];
  var Halogen_Component_Tree = PS["Halogen.Component.Tree"];
  var Data_Semigroup = PS["Data.Semigroup"];        
  var semigroupProps = new Data_Semigroup.Semigroup(Data_Function_Uncurried.runFn2($foreign.concatProps));
  var refProp = $foreign.refPropImpl(Data_Maybe.Nothing.value)(Data_Maybe.Just.create);
  var monoidProps = new Data_Monoid.Monoid(function () {
      return semigroupProps;
  }, $foreign.emptyProps);
  exports["refProp"] = refProp;
  exports["semigroupProps"] = semigroupProps;
  exports["monoidProps"] = monoidProps;
  exports["attr"] = $foreign.attr;
  exports["createElement"] = $foreign.createElement;
  exports["diff"] = $foreign.diff;
  exports["handlerProp"] = $foreign.handlerProp;
  exports["patch"] = $foreign.patch;
  exports["prop"] = $foreign.prop;
  exports["vnode"] = $foreign.vnode;
  exports["vtext"] = $foreign.vtext;
  exports["widget"] = $foreign.widget;
})(PS["Halogen.Internal.VirtualDOM"] = PS["Halogen.Internal.VirtualDOM"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Control_Monad_Aff = PS["Control.Monad.Aff"];
  var Control_Monad_Eff = PS["Control.Monad.Eff"];
  var Control_Monad_Eff_Exception = PS["Control.Monad.Eff.Exception"];
  var Data_Exists = PS["Data.Exists"];
  var Data_ExistsR = PS["Data.ExistsR"];
  var Data_Foldable = PS["Data.Foldable"];
  var Data_Function_Uncurried = PS["Data.Function.Uncurried"];
  var Data_Lazy = PS["Data.Lazy"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Monoid = PS["Data.Monoid"];
  var Data_Nullable = PS["Data.Nullable"];
  var Halogen_Effects = PS["Halogen.Effects"];
  var Halogen_Component_Tree = PS["Halogen.Component.Tree"];
  var Halogen_HTML_Core = PS["Halogen.HTML.Core"];
  var Halogen_HTML_Events_Handler = PS["Halogen.HTML.Events.Handler"];
  var Halogen_Internal_VirtualDOM = PS["Halogen.Internal.VirtualDOM"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Data_Functor = PS["Data.Functor"];
  var Data_Function = PS["Data.Function"];
  var Control_Applicative = PS["Control.Applicative"];
  var Data_Unit = PS["Data.Unit"];
  var Data_Semigroup = PS["Data.Semigroup"];
  var Control_Bind = PS["Control.Bind"];        
  var handleAff = function ($40) {
      return Data_Functor["void"](Control_Monad_Eff.functorEff)(Control_Monad_Aff.runAff(Control_Monad_Eff_Exception.throwException)(Data_Function["const"](Control_Applicative.pure(Control_Monad_Eff.applicativeEff)(Data_Unit.unit)))($40));
  };
  var renderProp = function (v) {
      return function (v1) {
          if (v1 instanceof Halogen_HTML_Core.Prop) {
              return Data_Exists.runExists(function (v2) {
                  return Halogen_Internal_VirtualDOM.prop(Halogen_HTML_Core.runPropName(v2.value0), v2.value1);
              })(v1.value0);
          };
          if (v1 instanceof Halogen_HTML_Core.Attr) {
              var attrName = Data_Maybe.maybe("")(function (ns$prime) {
                  return Halogen_HTML_Core.runNamespace(ns$prime) + ":";
              })(v1.value0) + Halogen_HTML_Core.runAttrName(v1.value1);
              return Halogen_Internal_VirtualDOM.attr(attrName, v1.value2);
          };
          if (v1 instanceof Halogen_HTML_Core.Handler) {
              return Data_ExistsR.runExistsR(function (v2) {
                  return Halogen_Internal_VirtualDOM.handlerProp(Halogen_HTML_Core.runEventName(v2.value0), function (ev) {
                      return Data_Function.apply(handleAff)(Control_Bind.bind(Control_Monad_Aff.bindAff)(Halogen_HTML_Events_Handler.runEventHandler(Control_Monad_Aff.monadAff)(Control_Monad_Aff.monadEffAff)(ev)(v2.value1(ev)))(Data_Maybe.maybe(Control_Applicative.pure(Control_Monad_Aff.applicativeAff)(Data_Unit.unit))(v)));
                  });
              })(v1.value0);
          };
          if (v1 instanceof Halogen_HTML_Core.Ref) {
              return Halogen_Internal_VirtualDOM.refProp(function ($41) {
                  return handleAff(v(v1.value0($41)));
              });
          };
          return Data_Monoid.mempty(Halogen_Internal_VirtualDOM.monoidProps);
      };
  };
  var findKey = function (v) {
      return function (v1) {
          if (v1 instanceof Halogen_HTML_Core.Key) {
              return new Data_Maybe.Just(v1.value0);
          };
          return v;
      };
  };
  var renderTree = function (f) {
      return Halogen_Component_Tree.runTree(function (tree) {
          var go = function (v) {
              if (v instanceof Halogen_HTML_Core.Text) {
                  return Halogen_Internal_VirtualDOM.vtext(v.value0);
              };
              if (v instanceof Halogen_HTML_Core.Slot) {
                  return Halogen_Internal_VirtualDOM.widget(v.value0)(tree.eq)(renderTree(f));
              };
              if (v instanceof Halogen_HTML_Core.Element) {
                  var tag = Halogen_HTML_Core.runTagName(v.value1);
                  var ns$prime = Data_Function.apply(Data_Nullable.toNullable)(Data_Functor.map(Data_Maybe.functorMaybe)(Halogen_HTML_Core.runNamespace)(v.value0));
                  var key = Data_Function.apply(Data_Nullable.toNullable)(Data_Foldable.foldl(Data_Foldable.foldableArray)(findKey)(Data_Maybe.Nothing.value)(v.value2));
                  return Halogen_Internal_VirtualDOM.vnode(ns$prime)(tag)(key)(Data_Foldable.foldMap(Data_Foldable.foldableArray)(Halogen_Internal_VirtualDOM.monoidProps)(renderProp(f))(v.value2))(Data_Functor.map(Data_Functor.functorArray)(go)(v.value3));
              };
              throw new Error("Failed pattern match at Halogen.HTML.Renderer.VirtualDOM line 49, column 5 - line 56, column 28: " + [ v.constructor.name ]);
          };
          return go(Data_Lazy.force(tree.html));
      });
  };
  exports["renderTree"] = renderTree;
})(PS["Halogen.HTML.Renderer.VirtualDOM"] = PS["Halogen.HTML.Renderer.VirtualDOM"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Control_Coroutine = PS["Control.Coroutine"];
  var Control_Coroutine_Stalling_1 = PS["Control.Coroutine.Stalling"];
  var Control_Coroutine_Stalling_1 = PS["Control.Coroutine.Stalling"];
  var Control_Monad_Aff = PS["Control.Monad.Aff"];
  var Control_Monad_Aff_AVar = PS["Control.Monad.Aff.AVar"];
  var Control_Monad_Eff_Class = PS["Control.Monad.Eff.Class"];
  var Control_Monad_Eff_Exception = PS["Control.Monad.Eff.Exception"];
  var Control_Monad_Error_Class = PS["Control.Monad.Error.Class"];
  var Control_Monad_Free = PS["Control.Monad.Free"];
  var Control_Monad_Rec_Class = PS["Control.Monad.Rec.Class"];
  var Control_Monad_State = PS["Control.Monad.State"];
  var Control_Monad_Trans = PS["Control.Monad.Trans"];
  var Data_Either = PS["Data.Either"];
  var Data_Foldable = PS["Data.Foldable"];
  var Data_List = PS["Data.List"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Tuple = PS["Data.Tuple"];
  var DOM_HTML_Types = PS["DOM.HTML.Types"];
  var DOM_Node_Node = PS["DOM.Node.Node"];
  var Halogen_Component = PS["Halogen.Component"];
  var Halogen_Component_Hook = PS["Halogen.Component.Hook"];
  var Halogen_Effects = PS["Halogen.Effects"];
  var Halogen_HTML_Renderer_VirtualDOM = PS["Halogen.HTML.Renderer.VirtualDOM"];
  var Halogen_Internal_VirtualDOM = PS["Halogen.Internal.VirtualDOM"];
  var Halogen_Query = PS["Halogen.Query"];
  var Halogen_Query_HalogenF = PS["Halogen.Query.HalogenF"];
  var Halogen_Query_EventSource = PS["Halogen.Query.EventSource"];
  var Halogen_Query_StateF = PS["Halogen.Query.StateF"];
  var Control_Bind = PS["Control.Bind"];
  var Data_Function = PS["Data.Function"];
  var Control_Monad_State_Trans = PS["Control.Monad.State.Trans"];
  var Data_Identity = PS["Data.Identity"];
  var Control_Applicative = PS["Control.Applicative"];
  var Data_HeytingAlgebra = PS["Data.HeytingAlgebra"];
  var Data_Unit = PS["Data.Unit"];
  var Control_Monad_Free_Trans = PS["Control.Monad.Free.Trans"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Data_Functor = PS["Data.Functor"];        
  var onInitializers = function (dictFoldable) {
      return function (f) {
          var go = function (v) {
              return function (as) {
                  if (v instanceof Halogen_Component_Hook.PostRender) {
                      return new Data_List.Cons(f(v.value0), as);
                  };
                  return as;
              };
          };
          return Data_Foldable.foldr(dictFoldable)(go)(Data_List.Nil.value);
      };
  };
  var onFinalizers = function (dictFoldable) {
      return function (f) {
          var go = function (v) {
              return function (as) {
                  if (v instanceof Halogen_Component_Hook.Finalized) {
                      return new Data_List.Cons(f(v.value0), as);
                  };
                  return as;
              };
          };
          return Data_Foldable.foldr(dictFoldable)(go)(Data_List.Nil.value);
      };
  };
  var runUI = function (c) {
      return function (s) {
          return function (element) {
              var driver$prime = function (e) {
                  return function (s1) {
                      return function (i) {
                          return Control_Bind.bind(Control_Monad_Aff.bindAff)(Control_Monad_Aff_AVar["makeVar'"](s1))(function (v) {
                              return Data_Function.flip(Control_Monad_Free.runFreeM(Halogen_Query_HalogenF.functorHalogenF(Control_Monad_Aff.functorAff))(Control_Monad_Aff.monadRecAff))(e(i))(function (h) {
                                  if (h instanceof Halogen_Query_HalogenF.StateHF) {
                                      return Control_Bind.bind(Control_Monad_Aff.bindAff)(Control_Monad_Aff_AVar.takeVar(v))(function (v1) {
                                          var $29 = Control_Monad_State.runState(Halogen_Query_StateF.stateN(Control_Monad_State_Trans.monadStateT(Data_Identity.monadIdentity))(Control_Monad_State_Trans.monadStateStateT(Data_Identity.monadIdentity))(h.value0))(v1);
                                          return Control_Bind.bind(Control_Monad_Aff.bindAff)(Control_Monad_Aff_AVar.putVar(v)($29.value1))(function () {
                                              return Control_Applicative.pure(Control_Monad_Aff.applicativeAff)($29.value0);
                                          });
                                      });
                                  };
                                  if (h instanceof Halogen_Query_HalogenF.SubscribeHF) {
                                      return Control_Applicative.pure(Control_Monad_Aff.applicativeAff)(h.value1);
                                  };
                                  if (h instanceof Halogen_Query_HalogenF.RenderHF) {
                                      return Control_Applicative.pure(Control_Monad_Aff.applicativeAff)(h.value1);
                                  };
                                  if (h instanceof Halogen_Query_HalogenF.RenderPendingHF) {
                                      return Data_Function.apply(Control_Applicative.pure(Control_Monad_Aff.applicativeAff))(h.value0(Data_Maybe.Nothing.value));
                                  };
                                  if (h instanceof Halogen_Query_HalogenF.QueryHF) {
                                      return h.value0;
                                  };
                                  if (h instanceof Halogen_Query_HalogenF.HaltHF) {
                                      return Data_Function.apply(Control_Monad_Error_Class.throwError(Control_Monad_Aff.monadErrorAff))(Control_Monad_Eff_Exception.error(h.value0));
                                  };
                                  throw new Error("Failed pattern match at Halogen.Driver line 145, column 7 - line 156, column 45: " + [ h.constructor.name ]);
                              });
                          });
                      };
                  };
              };
              var render = function (ref) {
                  return Control_Bind.bind(Control_Monad_Aff.bindAff)(Control_Monad_Aff_AVar.takeVar(ref))(function (v) {
                      if (v.renderPaused) {
                          return Data_Function.apply(Control_Monad_Aff_AVar.putVar(ref))((function () {
                              var $42 = {};
                              for (var $43 in v) {
                                  if (v.hasOwnProperty($43)) {
                                      $42[$43] = v[$43];
                                  };
                              };
                              $42.renderPending = true;
                              return $42;
                          })());
                      };
                      if (!v.renderPaused) {
                          var rc = Halogen_Component.renderComponent(c)(v.state);
                          var vtree$prime = Halogen_HTML_Renderer_VirtualDOM.renderTree(driver(ref))(rc.tree);
                          return Control_Bind.bind(Control_Monad_Aff.bindAff)(Data_Function.apply(Control_Monad_Eff_Class.liftEff(Control_Monad_Aff.monadEffAff))(Halogen_Internal_VirtualDOM.patch(Halogen_Internal_VirtualDOM.diff(v.vtree)(vtree$prime))(v.node)))(function (v1) {
                              return Control_Bind.bind(Control_Monad_Aff.bindAff)(Control_Monad_Aff_AVar.putVar(ref)({
                                  node: v1, 
                                  vtree: vtree$prime, 
                                  state: rc.state, 
                                  renderPending: false, 
                                  renderPaused: true
                              }))(function () {
                                  return Control_Bind.bind(Control_Monad_Aff.bindAff)(Data_Function.apply(Control_Monad_Aff.forkAll(Data_List.foldableList))(onFinalizers(Data_Foldable.foldableArray)(Halogen_Component_Hook.runFinalized(driver$prime))(rc.hooks)))(function () {
                                      return Control_Bind.bind(Control_Monad_Aff.bindAff)(Data_Function.apply(Control_Monad_Aff.forkAll(Data_List.foldableList))(onInitializers(Data_Foldable.foldableArray)(driver(ref))(rc.hooks)))(function () {
                                          return Control_Bind.bind(Control_Monad_Aff.bindAff)(Control_Monad_Aff_AVar.modifyVar(function (v2) {
                                              var $46 = {};
                                              for (var $47 in v2) {
                                                  if (v2.hasOwnProperty($47)) {
                                                      $46[$47] = v2[$47];
                                                  };
                                              };
                                              $46.renderPaused = false;
                                              return $46;
                                          })(ref))(function () {
                                              return flushRender(ref);
                                          });
                                      });
                                  });
                              });
                          });
                      };
                      throw new Error("Failed pattern match at Halogen.Driver line 161, column 5 - line 177, column 24: " + [ v.renderPaused.constructor.name ]);
                  });
              };
              var flushRender = Control_Monad_Rec_Class.tailRecM(Control_Monad_Aff.monadRecAff)(function (ref) {
                  return Control_Bind.bind(Control_Monad_Aff.bindAff)(Control_Monad_Aff_AVar.takeVar(ref))(function (v) {
                      return Control_Bind.bind(Control_Monad_Aff.bindAff)(Control_Monad_Aff_AVar.putVar(ref)(v))(function () {
                          var $50 = !v.renderPending;
                          if ($50) {
                              return Control_Applicative.pure(Control_Monad_Aff.applicativeAff)(new Data_Either.Right(Data_Unit.unit));
                          };
                          if (!$50) {
                              return Control_Bind.bind(Control_Monad_Aff.bindAff)(render(ref))(function () {
                                  return Control_Applicative.pure(Control_Monad_Aff.applicativeAff)(new Data_Either.Left(ref));
                              });
                          };
                          throw new Error("Failed pattern match at Halogen.Driver line 183, column 5 - line 187, column 24: " + [ $50.constructor.name ]);
                      });
                  });
              });
              var $$eval = function (ref) {
                  return function (rpRef) {
                      return function (h) {
                          if (h instanceof Halogen_Query_HalogenF.StateHF) {
                              return Control_Bind.bind(Control_Monad_Aff.bindAff)(Control_Monad_Aff_AVar.takeVar(ref))(function (v) {
                                  if (h.value0 instanceof Halogen_Query_StateF.Get) {
                                      return Control_Bind.bind(Control_Monad_Aff.bindAff)(Control_Monad_Aff_AVar.putVar(ref)(v))(function () {
                                          return Control_Applicative.pure(Control_Monad_Aff.applicativeAff)(h.value0.value0(v.state));
                                      });
                                  };
                                  if (h.value0 instanceof Halogen_Query_StateF.Modify) {
                                      return Control_Bind.bind(Control_Monad_Aff.bindAff)(Control_Monad_Aff_AVar.takeVar(rpRef))(function (v1) {
                                          return Control_Bind.bind(Control_Monad_Aff.bindAff)(Data_Function.apply(Control_Monad_Aff_AVar.putVar(ref))((function () {
                                              var $56 = {};
                                              for (var $57 in v) {
                                                  if (v.hasOwnProperty($57)) {
                                                      $56[$57] = v[$57];
                                                  };
                                              };
                                              $56.state = h.value0.value0(v.state);
                                              return $56;
                                          })()))(function () {
                                              return Control_Bind.bind(Control_Monad_Aff.bindAff)(Data_Function.apply(Control_Monad_Aff_AVar.putVar(rpRef))(new Data_Maybe.Just(Halogen_Query_HalogenF.Pending.value)))(function () {
                                                  return Control_Applicative.pure(Control_Monad_Aff.applicativeAff)(h.value0.value1);
                                              });
                                          });
                                      });
                                  };
                                  throw new Error("Failed pattern match at Halogen.Driver line 107, column 9 - line 115, column 22: " + [ h.value0.constructor.name ]);
                              });
                          };
                          if (h instanceof Halogen_Query_HalogenF.SubscribeHF) {
                              var producer = Halogen_Query_EventSource.runEventSource(h.value0);
                              var consumer = Control_Monad_Rec_Class.forever(Control_Monad_Free_Trans.monadRecFreeT(Control_Coroutine.functorAwait)(Control_Monad_Aff.monadAff))(Control_Bind.bindFlipped(Control_Monad_Free_Trans.bindFreeT(Control_Coroutine.functorAwait)(Control_Monad_Aff.monadAff))(function ($78) {
                                  return Control_Monad_Trans.lift(Control_Monad_Free_Trans.monadTransFreeT(Control_Coroutine.functorAwait))(Control_Monad_Aff.monadAff)(driver(ref)($78));
                              })(Control_Coroutine["await"](Control_Monad_Aff.monadAff)));
                              return Control_Bind.bind(Control_Monad_Aff.bindAff)(Data_Function.apply(Control_Monad_Aff.forkAff)(Control_Coroutine_Stalling_1.runStallingProcess(Control_Monad_Aff.monadRecAff)(Control_Coroutine_Stalling_1.fuse(Control_Monad_Aff.monadRecAff)(Control_Monad_Aff.monadParAff)(producer)(consumer))))(function () {
                                  return Control_Applicative.pure(Control_Monad_Aff.applicativeAff)(h.value1);
                              });
                          };
                          if (h instanceof Halogen_Query_HalogenF.RenderHF) {
                              return Control_Bind.bind(Control_Monad_Aff.bindAff)(Control_Monad_Aff_AVar.modifyVar(Data_Function["const"](h.value0))(rpRef))(function () {
                                  return Control_Bind.bind(Control_Monad_Aff.bindAff)(Data_Function.apply(Control_Applicative.when(Control_Monad_Aff.applicativeAff)(Data_Maybe.isNothing(h.value0)))(render(ref)))(function () {
                                      return Control_Applicative.pure(Control_Monad_Aff.applicativeAff)(h.value1);
                                  });
                              });
                          };
                          if (h instanceof Halogen_Query_HalogenF.RenderPendingHF) {
                              return Control_Bind.bind(Control_Monad_Aff.bindAff)(Control_Monad_Aff_AVar.takeVar(rpRef))(function (v) {
                                  return Control_Bind.bind(Control_Monad_Aff.bindAff)(Control_Monad_Aff_AVar.putVar(rpRef)(v))(function () {
                                      return Data_Function.apply(Control_Applicative.pure(Control_Monad_Aff.applicativeAff))(h.value0(v));
                                  });
                              });
                          };
                          if (h instanceof Halogen_Query_HalogenF.QueryHF) {
                              return Control_Bind.bind(Control_Monad_Aff.bindAff)(Control_Monad_Aff_AVar.takeVar(rpRef))(function (v) {
                                  return Control_Bind.bind(Control_Monad_Aff.bindAff)(Data_Function.apply(Control_Applicative.when(Control_Monad_Aff.applicativeAff)(Data_Maybe.isJust(v)))(render(ref)))(function () {
                                      return Control_Bind.bind(Control_Monad_Aff.bindAff)(Control_Monad_Aff_AVar.putVar(rpRef)(Data_Maybe.Nothing.value))(function () {
                                          return h.value0;
                                      });
                                  });
                              });
                          };
                          if (h instanceof Halogen_Query_HalogenF.HaltHF) {
                              return Data_Function.apply(Control_Monad_Error_Class.throwError(Control_Monad_Aff.monadErrorAff))(Control_Monad_Eff_Exception.error(h.value0));
                          };
                          throw new Error("Failed pattern match at Halogen.Driver line 104, column 5 - line 134, column 43: " + [ h.constructor.name ]);
                      };
                  };
              };
              var driver = function (ref) {
                  return function (q) {
                      return Control_Bind.bind(Control_Monad_Aff.bindAff)(Control_Monad_Aff_AVar["makeVar'"](Data_Maybe.Nothing.value))(function (v) {
                          return Control_Bind.bind(Control_Monad_Aff.bindAff)(Control_Monad_Free.runFreeM(Halogen_Query_HalogenF.functorHalogenF(Control_Monad_Aff.functorAff))(Control_Monad_Aff.monadRecAff)($$eval(ref)(v))(Halogen_Component.queryComponent(c)(q)))(function (v1) {
                              return Control_Bind.bind(Control_Monad_Aff.bindAff)(Control_Monad_Aff_AVar.takeVar(v))(function (v2) {
                                  return Control_Bind.bind(Control_Monad_Aff.bindAff)(Data_Function.apply(Control_Applicative.when(Control_Monad_Aff.applicativeAff)(Data_Maybe.isJust(v2)))(render(ref)))(function () {
                                      return Control_Applicative.pure(Control_Monad_Aff.applicativeAff)(v1);
                                  });
                              });
                          });
                      });
                  };
              };
              return Data_Functor.map(Control_Monad_Aff.functorAff)(function (v) {
                  return v.driver;
              })(Control_Bind.bind(Control_Monad_Aff.bindAff)(Control_Monad_Aff_AVar.makeVar)(function (v) {
                  var rc = Halogen_Component.renderComponent(c)(s);
                  var dr = driver(v);
                  var vtree = Halogen_HTML_Renderer_VirtualDOM.renderTree(dr)(rc.tree);
                  var node = Halogen_Internal_VirtualDOM.createElement(vtree);
                  return Control_Bind.bind(Control_Monad_Aff.bindAff)(Control_Monad_Aff_AVar.putVar(v)({
                      node: node, 
                      vtree: vtree, 
                      state: rc.state, 
                      renderPending: false, 
                      renderPaused: true
                  }))(function () {
                      return Control_Bind.bind(Control_Monad_Aff.bindAff)(Data_Function.apply(Control_Monad_Eff_Class.liftEff(Control_Monad_Aff.monadEffAff))(DOM_Node_Node.appendChild(DOM_HTML_Types.htmlElementToNode(node))(DOM_HTML_Types.htmlElementToNode(element))))(function () {
                          return Control_Bind.bind(Control_Monad_Aff.bindAff)(Data_Function.apply(Control_Monad_Aff.forkAll(Data_List.foldableList))(onInitializers(Data_Foldable.foldableArray)(dr)(rc.hooks)))(function () {
                              return Control_Bind.bind(Control_Monad_Aff.bindAff)(Data_Function.apply(Control_Monad_Aff.forkAff)(Data_Maybe.maybe(Control_Applicative.pure(Control_Monad_Aff.applicativeAff)(Data_Unit.unit))(dr)(Halogen_Component.initializeComponent(c))))(function () {
                                  return Control_Bind.bind(Control_Monad_Aff.bindAff)(Control_Monad_Aff_AVar.modifyVar(function (v1) {
                                      var $75 = {};
                                      for (var $76 in v1) {
                                          if (v1.hasOwnProperty($76)) {
                                              $75[$76] = v1[$76];
                                          };
                                      };
                                      $75.renderPaused = false;
                                      return $75;
                                  })(v))(function () {
                                      return Control_Bind.bind(Control_Monad_Aff.bindAff)(flushRender(v))(function () {
                                          return Control_Applicative.pure(Control_Monad_Aff.applicativeAff)({
                                              driver: dr
                                          });
                                      });
                                  });
                              });
                          });
                      });
                  });
              }));
          };
      };
  };
  exports["runUI"] = runUI;
})(PS["Halogen.Driver"] = PS["Halogen.Driver"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Halogen_HTML_Core = PS["Halogen.HTML.Core"];
  var textarea = function (xs) {
      return Halogen_HTML_Core.element(Halogen_HTML_Core.tagName("textarea"))(xs)([  ]);
  };
  var p = function (xs) {
      return Halogen_HTML_Core.element(Halogen_HTML_Core.tagName("p"))(xs);
  };
  var p_ = p([  ]);    
  var input = function (props) {
      return Halogen_HTML_Core.element(Halogen_HTML_Core.tagName("input"))(props)([  ]);
  };                 
  var h1 = function (xs) {
      return Halogen_HTML_Core.element(Halogen_HTML_Core.tagName("h1"))(xs);
  };
  var h1_ = h1([  ]);
  var div = function (xs) {
      return Halogen_HTML_Core.element(Halogen_HTML_Core.tagName("div"))(xs);
  };
  var div_ = div([  ]);
  var button = function (xs) {
      return Halogen_HTML_Core.element(Halogen_HTML_Core.tagName("button"))(xs);
  };
  exports["button"] = button;
  exports["div"] = div;
  exports["div_"] = div_;
  exports["h1"] = h1;
  exports["h1_"] = h1_;
  exports["input"] = input;
  exports["p"] = p;
  exports["p_"] = p_;
  exports["textarea"] = textarea;
})(PS["Halogen.HTML.Elements"] = PS["Halogen.HTML.Elements"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Halogen_Component = PS["Halogen.Component"];
  var Halogen_Component_ChildPath = PS["Halogen.Component.ChildPath"];
  var Halogen_HTML_Core = PS["Halogen.HTML.Core"];
  var Halogen_HTML_Elements = PS["Halogen.HTML.Elements"];
  var Data_Functor = PS["Data.Functor"];        
  var text = Halogen_HTML_Core.Text.create;
  var slot$prime = function (dictFunctor) {
      return function (i) {
          return function (p) {
              return function (l) {
                  var transform = function (def) {
                      return {
                          component: Halogen_Component.transformChild(dictFunctor)(i)(def.component), 
                          initialState: Halogen_Component_ChildPath.injState(i)(def.initialState)
                      };
                  };
                  return new Halogen_HTML_Core.Slot(new Halogen_Component.SlotConstructor(Halogen_Component_ChildPath.injSlot(i)(p), Data_Functor.map(Data_Functor.functorFn)(transform)(l)));
              };
          };
      };
  };
  var slot = function (p) {
      return function (l) {
          return new Halogen_HTML_Core.Slot(new Halogen_Component.SlotConstructor(p, l));
      };
  };
  exports["slot"] = slot;
  exports["slot'"] = slot$prime;
  exports["text"] = text;
})(PS["Halogen.HTML"] = PS["Halogen.HTML"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_String = PS["Data.String"];
  var DOM_HTML_Types = PS["DOM.HTML.Types"];
  var Halogen_HTML_Core = PS["Halogen.HTML.Core"];
  var Data_Function = PS["Data.Function"];
  var Data_Show = PS["Data.Show"];
  var Data_Semigroup = PS["Data.Semigroup"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Data_HeytingAlgebra = PS["Data.HeytingAlgebra"];
  var Data_Functor = PS["Data.Functor"];
  var value = Halogen_HTML_Core.prop(Halogen_HTML_Core.stringIsProp)(Halogen_HTML_Core.propName("value"))(Data_Function.apply(Data_Maybe.Just.create)(Halogen_HTML_Core.attrName("value")));
  var type_ = Halogen_HTML_Core.prop(Halogen_HTML_Core.stringIsProp)(Halogen_HTML_Core.propName("type"))(Data_Function.apply(Data_Maybe.Just.create)(Halogen_HTML_Core.attrName("type")));                    
  var name = Halogen_HTML_Core.prop(Halogen_HTML_Core.stringIsProp)(Halogen_HTML_Core.propName("name"))(Data_Function.apply(Data_Maybe.Just.create)(Halogen_HTML_Core.attrName("name")));
  exports["name"] = name;
  exports["type_"] = type_;
  exports["value"] = value;
})(PS["Halogen.HTML.Properties"] = PS["Halogen.HTML.Properties"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Data_Array = PS["Data.Array"];
  var Data_Foldable = PS["Data.Foldable"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Tuple = PS["Data.Tuple"];
  var Unsafe_Coerce = PS["Unsafe.Coerce"];
  var DOM_HTML_Types = PS["DOM.HTML.Types"];
  var Halogen_HTML_Core = PS["Halogen.HTML.Core"];
  var Halogen_HTML_Properties_1 = PS["Halogen.HTML.Properties"];
  var Halogen_HTML_Properties_1 = PS["Halogen.HTML.Properties"];
  var Data_Semigroup = PS["Data.Semigroup"];
  var Data_Eq = PS["Data.Eq"];
  var Data_Boolean = PS["Data.Boolean"];
  var Data_Monoid = PS["Data.Monoid"];
  var Data_Functor = PS["Data.Functor"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Data_HeytingAlgebra = PS["Data.HeytingAlgebra"];
  var InputButton = (function () {
      function InputButton() {

      };
      InputButton.value = new InputButton();
      return InputButton;
  })();
  var InputCheckbox = (function () {
      function InputCheckbox() {

      };
      InputCheckbox.value = new InputCheckbox();
      return InputCheckbox;
  })();
  var InputColor = (function () {
      function InputColor() {

      };
      InputColor.value = new InputColor();
      return InputColor;
  })();
  var InputDate = (function () {
      function InputDate() {

      };
      InputDate.value = new InputDate();
      return InputDate;
  })();
  var InputDatetime = (function () {
      function InputDatetime() {

      };
      InputDatetime.value = new InputDatetime();
      return InputDatetime;
  })();
  var InputDatetimeLocal = (function () {
      function InputDatetimeLocal() {

      };
      InputDatetimeLocal.value = new InputDatetimeLocal();
      return InputDatetimeLocal;
  })();
  var InputEmail = (function () {
      function InputEmail() {

      };
      InputEmail.value = new InputEmail();
      return InputEmail;
  })();
  var InputFile = (function () {
      function InputFile() {

      };
      InputFile.value = new InputFile();
      return InputFile;
  })();
  var InputHidden = (function () {
      function InputHidden() {

      };
      InputHidden.value = new InputHidden();
      return InputHidden;
  })();
  var InputImage = (function () {
      function InputImage() {

      };
      InputImage.value = new InputImage();
      return InputImage;
  })();
  var InputMonth = (function () {
      function InputMonth() {

      };
      InputMonth.value = new InputMonth();
      return InputMonth;
  })();
  var InputNumber = (function () {
      function InputNumber() {

      };
      InputNumber.value = new InputNumber();
      return InputNumber;
  })();
  var InputPassword = (function () {
      function InputPassword() {

      };
      InputPassword.value = new InputPassword();
      return InputPassword;
  })();
  var InputRadio = (function () {
      function InputRadio() {

      };
      InputRadio.value = new InputRadio();
      return InputRadio;
  })();
  var InputRange = (function () {
      function InputRange() {

      };
      InputRange.value = new InputRange();
      return InputRange;
  })();
  var InputReset = (function () {
      function InputReset() {

      };
      InputReset.value = new InputReset();
      return InputReset;
  })();
  var InputSearch = (function () {
      function InputSearch() {

      };
      InputSearch.value = new InputSearch();
      return InputSearch;
  })();
  var InputSubmit = (function () {
      function InputSubmit() {

      };
      InputSubmit.value = new InputSubmit();
      return InputSubmit;
  })();
  var InputTel = (function () {
      function InputTel() {

      };
      InputTel.value = new InputTel();
      return InputTel;
  })();
  var InputText = (function () {
      function InputText() {

      };
      InputText.value = new InputText();
      return InputText;
  })();
  var InputTime = (function () {
      function InputTime() {

      };
      InputTime.value = new InputTime();
      return InputTime;
  })();
  var InputUrl = (function () {
      function InputUrl() {

      };
      InputUrl.value = new InputUrl();
      return InputUrl;
  })();
  var InputWeek = (function () {
      function InputWeek() {

      };
      InputWeek.value = new InputWeek();
      return InputWeek;
  })();
  var ButtonButton = (function () {
      function ButtonButton() {

      };
      ButtonButton.value = new ButtonButton();
      return ButtonButton;
  })();
  var ButtonSubmit = (function () {
      function ButtonSubmit() {

      };
      ButtonSubmit.value = new ButtonSubmit();
      return ButtonSubmit;
  })();
  var ButtonReset = (function () {
      function ButtonReset() {

      };
      ButtonReset.value = new ButtonReset();
      return ButtonReset;
  })();
  var renderInputType = function (ty) {
      if (ty instanceof InputButton) {
          return "button";
      };
      if (ty instanceof InputCheckbox) {
          return "checkbox";
      };
      if (ty instanceof InputColor) {
          return "color";
      };
      if (ty instanceof InputDate) {
          return "date";
      };
      if (ty instanceof InputDatetime) {
          return "datetime";
      };
      if (ty instanceof InputDatetimeLocal) {
          return "datetime-local";
      };
      if (ty instanceof InputEmail) {
          return "email";
      };
      if (ty instanceof InputFile) {
          return "file";
      };
      if (ty instanceof InputHidden) {
          return "hidden";
      };
      if (ty instanceof InputImage) {
          return "image";
      };
      if (ty instanceof InputMonth) {
          return "month";
      };
      if (ty instanceof InputNumber) {
          return "number";
      };
      if (ty instanceof InputPassword) {
          return "password";
      };
      if (ty instanceof InputRadio) {
          return "radio";
      };
      if (ty instanceof InputRange) {
          return "range";
      };
      if (ty instanceof InputReset) {
          return "reset";
      };
      if (ty instanceof InputSearch) {
          return "search";
      };
      if (ty instanceof InputSubmit) {
          return "submit";
      };
      if (ty instanceof InputTel) {
          return "tel";
      };
      if (ty instanceof InputText) {
          return "text";
      };
      if (ty instanceof InputTime) {
          return "time";
      };
      if (ty instanceof InputUrl) {
          return "url";
      };
      if (ty instanceof InputWeek) {
          return "week";
      };
      throw new Error("Failed pattern match at Halogen.HTML.Properties.Indexed line 184, column 3 - line 209, column 1: " + [ ty.constructor.name ]);
  };
  var renderButtonType = function (ty) {
      if (ty instanceof ButtonButton) {
          return "button";
      };
      if (ty instanceof ButtonSubmit) {
          return "submit";
      };
      if (ty instanceof ButtonReset) {
          return "reset";
      };
      throw new Error("Failed pattern match at Halogen.HTML.Properties.Indexed line 269, column 3 - line 274, column 1: " + [ ty.constructor.name ]);
  };
  var refine = Unsafe_Coerce.unsafeCoerce;            
  var value = refine(Halogen_HTML_Properties_1.value);
  var name = refine(Halogen_HTML_Properties_1.name);
  var inputType = function ($20) {
      return refine(Halogen_HTML_Properties_1.type_)(renderInputType($20));
  };                                                      
  var buttonType = function ($22) {
      return refine(Halogen_HTML_Properties_1.type_)(renderButtonType($22));
  };
  exports["ButtonButton"] = ButtonButton;
  exports["ButtonSubmit"] = ButtonSubmit;
  exports["ButtonReset"] = ButtonReset;
  exports["InputButton"] = InputButton;
  exports["InputCheckbox"] = InputCheckbox;
  exports["InputColor"] = InputColor;
  exports["InputDate"] = InputDate;
  exports["InputDatetime"] = InputDatetime;
  exports["InputDatetimeLocal"] = InputDatetimeLocal;
  exports["InputEmail"] = InputEmail;
  exports["InputFile"] = InputFile;
  exports["InputHidden"] = InputHidden;
  exports["InputImage"] = InputImage;
  exports["InputMonth"] = InputMonth;
  exports["InputNumber"] = InputNumber;
  exports["InputPassword"] = InputPassword;
  exports["InputRadio"] = InputRadio;
  exports["InputRange"] = InputRange;
  exports["InputReset"] = InputReset;
  exports["InputSearch"] = InputSearch;
  exports["InputSubmit"] = InputSubmit;
  exports["InputTel"] = InputTel;
  exports["InputText"] = InputText;
  exports["InputTime"] = InputTime;
  exports["InputUrl"] = InputUrl;
  exports["InputWeek"] = InputWeek;
  exports["buttonType"] = buttonType;
  exports["inputType"] = inputType;
  exports["name"] = name;
  exports["value"] = value;
})(PS["Halogen.HTML.Properties.Indexed"] = PS["Halogen.HTML.Properties.Indexed"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Halogen_HTML_Core = PS["Halogen.HTML.Core"];
  var Halogen_HTML_Properties_Indexed = PS["Halogen.HTML.Properties.Indexed"];
  var Halogen_HTML_Elements_1 = PS["Halogen.HTML.Elements"];
  var Halogen_HTML_Elements_1 = PS["Halogen.HTML.Elements"];
  var Unsafe_Coerce = PS["Unsafe.Coerce"];                              
  var textarea = Unsafe_Coerce.unsafeCoerce(Halogen_HTML_Elements_1.textarea);
  var input = Unsafe_Coerce.unsafeCoerce(Halogen_HTML_Elements_1.input);  
  var button = Unsafe_Coerce.unsafeCoerce(Halogen_HTML_Elements_1.button);
  exports["button"] = button;
  exports["input"] = input;
  exports["textarea"] = textarea;
})(PS["Halogen.HTML.Elements.Indexed"] = PS["Halogen.HTML.Elements.Indexed"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Data_Maybe = PS["Data.Maybe"];
  var Halogen_Query = PS["Halogen.Query"];
  var Halogen_HTML_Events_Handler = PS["Halogen.HTML.Events.Handler"];
  var Halogen_HTML_Events_Types = PS["Halogen.HTML.Events.Types"];
  var Halogen_HTML_Core = PS["Halogen.HTML.Core"];
  var Data_Function = PS["Data.Function"];
  var Control_Applicative = PS["Control.Applicative"];                                      
  var onClick = Halogen_HTML_Core.handler(Halogen_HTML_Core.eventName("click"));
  var input_ = function (f) {
      return function (v) {
          return Data_Function.apply(Control_Applicative.pure(Halogen_HTML_Events_Handler.applicativeEventHandler))(Data_Function.apply(Data_Maybe.Just.create)(Halogen_Query.action(f)));
      };
  };
  var input = function (f) {
      return function (x) {
          return Data_Function.apply(Control_Applicative.pure(Halogen_HTML_Events_Handler.applicativeEventHandler))(Data_Function.apply(Data_Maybe.Just.create)(Halogen_Query.action(f(x))));
      };
  };
  exports["input"] = input;
  exports["input_"] = input_;
  exports["onClick"] = onClick;
})(PS["Halogen.HTML.Events"] = PS["Halogen.HTML.Events"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Data_Either = PS["Data.Either"];
  var Data_Foreign = PS["Data.Foreign"];
  var Data_Foreign_Class = PS["Data.Foreign.Class"];
  var Data_Maybe = PS["Data.Maybe"];
  var Halogen_HTML_Core = PS["Halogen.HTML.Core"];
  var Halogen_HTML_Events_Handler = PS["Halogen.HTML.Events.Handler"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Data_Function = PS["Data.Function"];
  var Control_Applicative = PS["Control.Applicative"];
  var Data_Foreign_Index = PS["Data.Foreign.Index"];        
  var addForeignPropHandler = function (dictIsForeign) {
      return function (key) {
          return function (prop) {
              return function (f) {
                  return Halogen_HTML_Core.handler(Halogen_HTML_Core.eventName(key))(function ($2) {
                      return Data_Either.either(Data_Function.apply(Data_Function["const"])(Control_Applicative.pure(Halogen_HTML_Events_Handler.applicativeEventHandler)(Data_Maybe.Nothing.value)))(f)(Data_Foreign_Class.readProp(dictIsForeign)(Data_Foreign_Index.indexString)(prop)(Data_Foreign.toForeign((function (v) {
                          return v.target;
                      })($2))));
                  });
              };
          };
      };
  };                                                                                                            
  var onValueChange = addForeignPropHandler(Data_Foreign_Class.stringIsForeign)("change")("value");
  var onValueInput = addForeignPropHandler(Data_Foreign_Class.stringIsForeign)("input")("value");
  exports["onValueChange"] = onValueChange;
  exports["onValueInput"] = onValueInput;
})(PS["Halogen.HTML.Events.Forms"] = PS["Halogen.HTML.Events.Forms"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Data_Maybe = PS["Data.Maybe"];
  var Unsafe_Coerce = PS["Unsafe.Coerce"];
  var Halogen_HTML_Core = PS["Halogen.HTML.Core"];
  var Halogen_HTML_Events_1 = PS["Halogen.HTML.Events"];
  var Halogen_HTML_Events_1 = PS["Halogen.HTML.Events"];
  var Halogen_HTML_Events_Forms = PS["Halogen.HTML.Events.Forms"];
  var Halogen_HTML_Events_Handler = PS["Halogen.HTML.Events.Handler"];
  var Halogen_HTML_Events_Types = PS["Halogen.HTML.Events.Types"];
  var Halogen_HTML_Properties_Indexed = PS["Halogen.HTML.Properties.Indexed"];        
  var refine$prime = Unsafe_Coerce.unsafeCoerce;
  var refine = Unsafe_Coerce.unsafeCoerce;
  var onValueInput = refine$prime(Halogen_HTML_Events_Forms.onValueInput);
  var onValueChange = refine$prime(Halogen_HTML_Events_Forms.onValueChange);
  var onClick = refine(Halogen_HTML_Events_1.onClick);
  exports["onClick"] = onClick;
  exports["onValueChange"] = onValueChange;
  exports["onValueInput"] = onValueInput;
})(PS["Halogen.HTML.Events.Indexed"] = PS["Halogen.HTML.Events.Indexed"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Control_Bind = PS["Control.Bind"];
  var Control_Monad_Aff = PS["Control.Monad.Aff"];
  var Control_Monad_Eff = PS["Control.Monad.Eff"];
  var Control_Monad_Eff_Class = PS["Control.Monad.Eff.Class"];
  var Control_Monad_Eff_Exception = PS["Control.Monad.Eff.Exception"];
  var Control_Monad_Error_Class = PS["Control.Monad.Error.Class"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Either = PS["Data.Either"];
  var Data_Nullable = PS["Data.Nullable"];
  var Data_Foreign = PS["Data.Foreign"];
  var DOM = PS["DOM"];
  var DOM_Event_EventTarget = PS["DOM.Event.EventTarget"];
  var DOM_HTML_Event_EventTypes = PS["DOM.HTML.Event.EventTypes"];
  var DOM_HTML = PS["DOM.HTML"];
  var DOM_HTML_Types = PS["DOM.HTML.Types"];
  var DOM_HTML_Window = PS["DOM.HTML.Window"];
  var DOM_Node_ParentNode = PS["DOM.Node.ParentNode"];
  var Halogen_Effects = PS["Halogen.Effects"];
  var Data_Function = PS["Data.Function"];
  var Data_Functor = PS["Data.Functor"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Control_Applicative = PS["Control.Applicative"];
  var Data_Unit = PS["Data.Unit"];        
  var selectElement = function (query) {
      return Control_Bind.bind(Control_Monad_Aff.bindAff)(Data_Function.apply(Control_Monad_Eff_Class.liftEff(Control_Monad_Aff.monadEffAff))(Data_Functor.map(Control_Monad_Eff.functorEff)(Data_Nullable.toMaybe)(Control_Bind.bindFlipped(Control_Monad_Eff.bindEff)(Control_Bind.composeKleisliFlipped(Control_Monad_Eff.bindEff)(function ($8) {
          return DOM_Node_ParentNode.querySelector(query)(DOM_HTML_Types.htmlDocumentToParentNode($8));
      })(DOM_HTML_Window.document))(DOM_HTML.window))))(function (v) {
          return Control_Applicative.pure(Control_Monad_Aff.applicativeAff)((function () {
              if (v instanceof Data_Maybe.Nothing) {
                  return Data_Maybe.Nothing.value;
              };
              if (v instanceof Data_Maybe.Just) {
                  return Data_Function.apply(Data_Either.either(Data_Function["const"](Data_Maybe.Nothing.value))(Data_Maybe.Just.create))(DOM_HTML_Types.readHTMLElement(Data_Foreign.toForeign(v.value0)));
              };
              throw new Error("Failed pattern match at Halogen.Util line 54, column 3 - line 56, column 76: " + [ v.constructor.name ]);
          })());
      });
  };
  var runHalogenAff = function ($9) {
      return Data_Functor["void"](Control_Monad_Eff.functorEff)(Control_Monad_Aff.runAff(Control_Monad_Eff_Exception.throwException)(Data_Function["const"](Control_Applicative.pure(Control_Monad_Eff.applicativeEff)(Data_Unit.unit)))($9));
  };
  var awaitLoad = Control_Monad_Aff.makeAff(function (v) {
      return function (callback) {
          return Data_Function.apply(Control_Monad_Eff_Class.liftEff(Control_Monad_Eff_Class.monadEffEff))(function __do() {
              var $10 = DOM_HTML.window();
              return DOM_Event_EventTarget.addEventListener(DOM_HTML_Event_EventTypes.load)(DOM_Event_EventTarget.eventListener(function (v1) {
                  return callback(Data_Unit.unit);
              }))(false)(DOM_HTML_Types.windowToEventTarget($10))();
          });
      };
  });
  var awaitBody = Control_Bind.bind(Control_Monad_Aff.bindAff)(awaitLoad)(function () {
      return Control_Bind.bindFlipped(Control_Monad_Aff.bindAff)(Data_Maybe.maybe(Control_Monad_Error_Class.throwError(Control_Monad_Aff.monadErrorAff)(Control_Monad_Eff_Exception.error("Could not find body")))(Control_Applicative.pure(Control_Monad_Aff.applicativeAff)))(selectElement("body"));
  });
  exports["awaitBody"] = awaitBody;
  exports["awaitLoad"] = awaitLoad;
  exports["runHalogenAff"] = runHalogenAff;
  exports["selectElement"] = selectElement;
})(PS["Halogen.Util"] = PS["Halogen.Util"] || {});
(function(exports) {
  /* global exports */
  /* global XMLHttpRequest */
  /* global module */
  "use strict";

  // module Network.HTTP.Affjax

  // jshint maxparams: 5
  exports._ajax = function (mkHeader, options, canceler, errback, callback) {
    var platformSpecific = { };
    if (typeof module !== "undefined" && module.require) {
      // We are on node.js
      platformSpecific.newXHR = function () {
        var XHR = module.require("xhr2");
        return new XHR();
      };

      platformSpecific.fixupUrl = function (url) {
        var urllib = module.require("url");
        var u = urllib.parse(url);
        u.protocol = u.protocol || "http:";
        u.hostname = u.hostname || "localhost";
        return urllib.format(u);
      };

      platformSpecific.getResponse = function (xhr) {
        return xhr.response;
      };
    } else {
      // We are in the browser
      platformSpecific.newXHR = function () {
        return new XMLHttpRequest();
      };

      platformSpecific.fixupUrl = function (url) {
        return url || "/";
      };

      platformSpecific.getResponse = function (xhr) {
        return xhr.response;
      };
    }

    return function () {
      var xhr = platformSpecific.newXHR();
      var fixedUrl = platformSpecific.fixupUrl(options.url);
      xhr.open(options.method || "GET", fixedUrl, true, options.username, options.password);
      if (options.headers) {
        try {
          for (var i = 0, header; (header = options.headers[i]) != null; i++) {
            xhr.setRequestHeader(header.field, header.value);
          }
        }
        catch (e) {
          errback(e)();
        }
      }
      xhr.onerror = function () {
        errback(new Error("AJAX request failed: " + options.method + " " + options.url))();
      };
      xhr.onload = function () {
        callback({
          status: xhr.status,
          headers: xhr.getAllResponseHeaders().split("\n")
            .filter(function (header) {
              return header.length > 0;
            })
            .map(function (header) {
              var i = header.indexOf(":");
              return mkHeader(header.substring(0, i))(header.substring(i + 2));
            }),
          response: platformSpecific.getResponse(xhr)
        })();
      };
      xhr.responseType = options.responseType;
      xhr.withCredentials = options.withCredentials;
      xhr.send(options.content);
      return canceler(xhr);
    };
  };

  // jshint maxparams: 4
  exports._cancelAjax = function (xhr, cancelError, errback, callback) {
    return function () {
      try { xhr.abort(); } catch (e) { return callback(false)(); }
      return callback(true)();
    };
  };
})(PS["Network.HTTP.Affjax"] = PS["Network.HTTP.Affjax"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Data_Argonaut_Core = PS["Data.Argonaut.Core"];
  var Data_ArrayBuffer_Types = PS["Data.ArrayBuffer.Types"];
  var Data_FormURLEncoded_1 = PS["Data.FormURLEncoded"];
  var Data_FormURLEncoded_1 = PS["Data.FormURLEncoded"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_MediaType = PS["Data.MediaType"];
  var Data_MediaType_Common = PS["Data.MediaType.Common"];
  var Data_Tuple = PS["Data.Tuple"];
  var DOM_File_Types = PS["DOM.File.Types"];
  var DOM_Node_Types = PS["DOM.Node.Types"];
  var DOM_XHR_Types = PS["DOM.XHR.Types"];
  var Unsafe_Coerce = PS["Unsafe.Coerce"];
  var Data_Show = PS["Data.Show"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];        
  var Requestable = function (toRequest) {
      this.toRequest = toRequest;
  };
  var toRequest = function (dict) {
      return dict.toRequest;
  };
  var requestableJson = new Requestable(function (json) {
      return new Data_Tuple.Tuple(new Data_Maybe.Just(Data_MediaType_Common.applicationJSON), Unsafe_Coerce.unsafeCoerce(Data_Show.show(Data_Argonaut_Core.showJson)(json)));
  });
  var defaultToRequest = function ($0) {
      return Data_Tuple.Tuple.create(Data_Maybe.Nothing.value)(Unsafe_Coerce.unsafeCoerce($0));
  };                                                                   
  var requestableUnit = new Requestable(defaultToRequest);
  exports["Requestable"] = Requestable;
  exports["toRequest"] = toRequest;
  exports["requestableJson"] = requestableJson;
  exports["requestableUnit"] = requestableUnit;
})(PS["Network.HTTP.Affjax.Request"] = PS["Network.HTTP.Affjax.Request"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Data_Argonaut_Core = PS["Data.Argonaut.Core"];
  var Data_ArrayBuffer_Types = PS["Data.ArrayBuffer.Types"];
  var Data_Either = PS["Data.Either"];
  var Data_Foreign = PS["Data.Foreign"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_MediaType = PS["Data.MediaType"];
  var Data_MediaType_Common = PS["Data.MediaType.Common"];
  var Data_Tuple = PS["Data.Tuple"];
  var DOM_File_Types = PS["DOM.File.Types"];
  var DOM_Node_Types = PS["DOM.Node.Types"];
  var Unsafe_Coerce = PS["Unsafe.Coerce"];
  var Data_Eq = PS["Data.Eq"];
  var Data_Show = PS["Data.Show"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Data_Function = PS["Data.Function"];
  var Data_Unit = PS["Data.Unit"];        
  var ArrayBufferResponse = (function () {
      function ArrayBufferResponse() {

      };
      ArrayBufferResponse.value = new ArrayBufferResponse();
      return ArrayBufferResponse;
  })();
  var BlobResponse = (function () {
      function BlobResponse() {

      };
      BlobResponse.value = new BlobResponse();
      return BlobResponse;
  })();
  var DocumentResponse = (function () {
      function DocumentResponse() {

      };
      DocumentResponse.value = new DocumentResponse();
      return DocumentResponse;
  })();
  var JSONResponse = (function () {
      function JSONResponse() {

      };
      JSONResponse.value = new JSONResponse();
      return JSONResponse;
  })();
  var StringResponse = (function () {
      function StringResponse() {

      };
      StringResponse.value = new StringResponse();
      return StringResponse;
  })();
  var Respondable = function (fromResponse, responseType) {
      this.fromResponse = fromResponse;
      this.responseType = responseType;
  }; 
  var responseTypeToString = function (v) {
      if (v instanceof ArrayBufferResponse) {
          return "arraybuffer";
      };
      if (v instanceof BlobResponse) {
          return "blob";
      };
      if (v instanceof DocumentResponse) {
          return "document";
      };
      if (v instanceof JSONResponse) {
          return "text";
      };
      if (v instanceof StringResponse) {
          return "text";
      };
      throw new Error("Failed pattern match at Network.HTTP.Affjax.Response line 50, column 1 - line 51, column 1: " + [ v.constructor.name ]);
  };
  var responseType = function (dict) {
      return dict.responseType;
  };                                                                                                                                     
  var responsableJson = new Respondable(function ($8) {
      return Data_Either.Right.create(Unsafe_Coerce.unsafeCoerce($8));
  }, new Data_Tuple.Tuple(new Data_Maybe.Just(Data_MediaType_Common.applicationJSON), JSONResponse.value));                                                             
  var fromResponse = function (dict) {
      return dict.fromResponse;
  };
  exports["ArrayBufferResponse"] = ArrayBufferResponse;
  exports["BlobResponse"] = BlobResponse;
  exports["DocumentResponse"] = DocumentResponse;
  exports["JSONResponse"] = JSONResponse;
  exports["StringResponse"] = StringResponse;
  exports["Respondable"] = Respondable;
  exports["fromResponse"] = fromResponse;
  exports["responseType"] = responseType;
  exports["responseTypeToString"] = responseTypeToString;
  exports["responsableJson"] = responsableJson;
})(PS["Network.HTTP.Affjax.Response"] = PS["Network.HTTP.Affjax.Response"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Data_MediaType = PS["Data.MediaType"];
  var Data_Eq = PS["Data.Eq"];
  var Data_HeytingAlgebra = PS["Data.HeytingAlgebra"];
  var Data_Show = PS["Data.Show"];
  var Data_Semigroup = PS["Data.Semigroup"];        
  var Accept = (function () {
      function Accept(value0) {
          this.value0 = value0;
      };
      Accept.create = function (value0) {
          return new Accept(value0);
      };
      return Accept;
  })();
  var ContentType = (function () {
      function ContentType(value0) {
          this.value0 = value0;
      };
      ContentType.create = function (value0) {
          return new ContentType(value0);
      };
      return ContentType;
  })();
  var RequestHeader = (function () {
      function RequestHeader(value0, value1) {
          this.value0 = value0;
          this.value1 = value1;
      };
      RequestHeader.create = function (value0) {
          return function (value1) {
              return new RequestHeader(value0, value1);
          };
      };
      return RequestHeader;
  })();
  var requestHeaderValue = function (v) {
      if (v instanceof Accept) {
          return Data_MediaType.unMediaType(v.value0);
      };
      if (v instanceof ContentType) {
          return Data_MediaType.unMediaType(v.value0);
      };
      if (v instanceof RequestHeader) {
          return v.value1;
      };
      throw new Error("Failed pattern match at Network.HTTP.RequestHeader line 29, column 1 - line 29, column 46: " + [ v.constructor.name ]);
  };
  var requestHeaderName = function (v) {
      if (v instanceof Accept) {
          return "Accept";
      };
      if (v instanceof ContentType) {
          return "Content-Type";
      };
      if (v instanceof RequestHeader) {
          return v.value0;
      };
      throw new Error("Failed pattern match at Network.HTTP.RequestHeader line 24, column 1 - line 25, column 1: " + [ v.constructor.name ]);
  };
  exports["Accept"] = Accept;
  exports["ContentType"] = ContentType;
  exports["RequestHeader"] = RequestHeader;
  exports["requestHeaderName"] = requestHeaderName;
  exports["requestHeaderValue"] = requestHeaderValue;
})(PS["Network.HTTP.RequestHeader"] = PS["Network.HTTP.RequestHeader"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Data_Generic = PS["Data.Generic"];
  var Control_Apply = PS["Control.Apply"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Unit = PS["Data.Unit"];
  var Data_Eq = PS["Data.Eq"];
  var Data_HeytingAlgebra = PS["Data.HeytingAlgebra"];
  var Data_Show = PS["Data.Show"];
  var Data_Semigroup = PS["Data.Semigroup"];        
  var ResponseHeader = (function () {
      function ResponseHeader(value0, value1) {
          this.value0 = value0;
          this.value1 = value1;
      };
      ResponseHeader.create = function (value0) {
          return function (value1) {
              return new ResponseHeader(value0, value1);
          };
      };
      return ResponseHeader;
  })();
  var responseHeader = function (field) {
      return function (value) {
          return new ResponseHeader(field, value);
      };
  };
  exports["responseHeader"] = responseHeader;
})(PS["Network.HTTP.ResponseHeader"] = PS["Network.HTTP.ResponseHeader"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Network.HTTP.Affjax"];
  var Prelude = PS["Prelude"];
  var Control_Bind = PS["Control.Bind"];
  var Control_Monad_Aff = PS["Control.Monad.Aff"];
  var Control_Monad_Aff_AVar = PS["Control.Monad.Aff.AVar"];
  var Control_Monad_Eff = PS["Control.Monad.Eff"];
  var Control_Monad_Eff_Class = PS["Control.Monad.Eff.Class"];
  var Control_Monad_Eff_Exception = PS["Control.Monad.Eff.Exception"];
  var Control_Monad_Eff_Ref = PS["Control.Monad.Eff.Ref"];
  var Control_Monad_Error_Class = PS["Control.Monad.Error.Class"];
  var Data_Array = PS["Data.Array"];
  var Data_Either = PS["Data.Either"];
  var Data_Foldable = PS["Data.Foldable"];
  var Data_Foreign = PS["Data.Foreign"];
  var Data_Function = PS["Data.Function"];
  var Data_Function_Uncurried = PS["Data.Function.Uncurried"];
  var Data_HTTP_Method_1 = PS["Data.HTTP.Method"];
  var Data_HTTP_Method_1 = PS["Data.HTTP.Method"];
  var Data_Int = PS["Data.Int"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_MediaType = PS["Data.MediaType"];
  var Data_Nullable = PS["Data.Nullable"];
  var Data_Tuple = PS["Data.Tuple"];
  var $$Math = PS["Math"];
  var DOM_XHR_Types = PS["DOM.XHR.Types"];
  var Network_HTTP_Affjax_Request = PS["Network.HTTP.Affjax.Request"];
  var Network_HTTP_Affjax_Response = PS["Network.HTTP.Affjax.Response"];
  var Network_HTTP_RequestHeader = PS["Network.HTTP.RequestHeader"];
  var Network_HTTP_ResponseHeader = PS["Network.HTTP.ResponseHeader"];
  var Network_HTTP_StatusCode = PS["Network.HTTP.StatusCode"];
  var Data_Functor = PS["Data.Functor"];
  var Data_Semiring = PS["Data.Semiring"];
  var Control_Applicative = PS["Control.Applicative"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Data_Ring = PS["Data.Ring"];
  var Data_Show = PS["Data.Show"];
  var Data_HeytingAlgebra = PS["Data.HeytingAlgebra"];
  var Data_BooleanAlgebra = PS["Data.BooleanAlgebra"];
  var Data_Eq = PS["Data.Eq"];
  var defaultRequest = {
      method: new Data_Either.Left(Data_HTTP_Method_1.GET.value), 
      url: "/", 
      headers: [  ], 
      content: Data_Maybe.Nothing.value, 
      username: Data_Maybe.Nothing.value, 
      password: Data_Maybe.Nothing.value, 
      withCredentials: false
  };
  var cancelAjax = function (xhr) {
      return function (err) {
          return Control_Monad_Aff.makeAff(function (eb) {
              return function (cb) {
                  return $foreign._cancelAjax(xhr, err, eb, cb);
              };
          });
      };
  };
  var affjax$prime = function (dictRequestable) {
      return function (dictRespondable) {
          return function (req) {
              return function (eb) {
                  return function (cb) {
                      var responseSettings = Network_HTTP_Affjax_Response.responseType(dictRespondable);
                      var requestSettings = (function () {
                          var $55 = Data_Functor.map(Data_Maybe.functorMaybe)(Network_HTTP_Affjax_Request.toRequest(dictRequestable))(req.content);
                          if ($55 instanceof Data_Maybe.Nothing) {
                              return new Data_Tuple.Tuple(Data_Maybe.Nothing.value, Data_Maybe.Nothing.value);
                          };
                          if ($55 instanceof Data_Maybe.Just) {
                              return new Data_Tuple.Tuple($55.value0.value0, new Data_Maybe.Just($55.value0.value1));
                          };
                          throw new Error("Failed pattern match at Network.HTTP.Affjax line 258, column 21 - line 260, column 49: " + [ $55.constructor.name ]);
                      })();
                      var fromResponse$prime = (function () {
                          var $59 = Data_Tuple.snd(responseSettings);
                          if ($59 instanceof Network_HTTP_Affjax_Response.JSONResponse) {
                              return Control_Bind.composeKleisliFlipped(Data_Either.bindEither)(Network_HTTP_Affjax_Response.fromResponse(dictRespondable))(Control_Bind.composeKleisliFlipped(Data_Either.bindEither)(Data_Foreign.parseJSON)(Data_Foreign.readString));
                          };
                          return Network_HTTP_Affjax_Response.fromResponse(dictRespondable);
                      })();
                      var cb$prime = function (res) {
                          var $63 = Data_Functor.map(Data_Either.functorEither)(function (v) {
                              var $60 = {};
                              for (var $61 in res) {
                                  if (res.hasOwnProperty($61)) {
                                      $60[$61] = res[$61];
                                  };
                              };
                              $60.response = v;
                              return $60;
                          })(fromResponse$prime(res.response));
                          if ($63 instanceof Data_Either.Left) {
                              return Data_Function.apply(eb)(Control_Monad_Eff_Exception.error(Data_Show.show(Data_Foreign.showForeignError)($63.value0)));
                          };
                          if ($63 instanceof Data_Either.Right) {
                              return cb($63.value0);
                          };
                          throw new Error("Failed pattern match at Network.HTTP.Affjax line 277, column 13 - line 279, column 26: " + [ $63.constructor.name ]);
                      };
                      var addHeader = function (h) {
                          return function (hs) {
                              if (h instanceof Data_Maybe.Just && Data_Function.apply(Data_HeytingAlgebra.not(Data_HeytingAlgebra.heytingAlgebraBoolean))(Data_Foldable.any(Data_Foldable.foldableArray)(Data_BooleanAlgebra.booleanAlgebraBoolean)(Data_Function.on(Data_Eq.eq(Data_Eq.eqString))(Network_HTTP_RequestHeader.requestHeaderName)(h.value0))(hs))) {
                                  return Data_Array.snoc(hs)(h.value0);
                              };
                              return hs;
                          };
                      };
                      var headers = Data_Function.apply(addHeader(Data_Functor.map(Data_Maybe.functorMaybe)(Network_HTTP_RequestHeader.ContentType.create)(Data_Tuple.fst(requestSettings))))(addHeader(Data_Functor.map(Data_Maybe.functorMaybe)(Network_HTTP_RequestHeader.Accept.create)(Data_Tuple.fst(responseSettings)))(req.headers));
                      var req$prime = {
                          method: Data_HTTP_Method_1.print(req.method), 
                          url: req.url, 
                          headers: Data_Functor.map(Data_Functor.functorArray)(function (h) {
                              return {
                                  field: Network_HTTP_RequestHeader.requestHeaderName(h), 
                                  value: Network_HTTP_RequestHeader.requestHeaderValue(h)
                              };
                          })(headers), 
                          content: Data_Nullable.toNullable(Data_Tuple.snd(requestSettings)), 
                          responseType: Network_HTTP_Affjax_Response.responseTypeToString(Data_Tuple.snd(responseSettings)), 
                          username: Data_Nullable.toNullable(req.username), 
                          password: Data_Nullable.toNullable(req.password), 
                          withCredentials: req.withCredentials
                      };
                      return $foreign._ajax(Network_HTTP_ResponseHeader.responseHeader, req$prime, cancelAjax, eb, cb$prime);
                  };
              };
          };
      };
  };
  var affjax = function (dictRequestable) {
      return function (dictRespondable) {
          return function ($94) {
              return Control_Monad_Aff["makeAff'"](affjax$prime(dictRequestable)(dictRespondable)($94));
          };
      };
  };
  var post = function (dictRequestable) {
      return function (dictRespondable) {
          return function (u) {
              return function (c) {
                  return Data_Function.apply(affjax(dictRequestable)(dictRespondable))((function () {
                      var $80 = {};
                      for (var $81 in defaultRequest) {
                          if (defaultRequest.hasOwnProperty($81)) {
                              $80[$81] = defaultRequest[$81];
                          };
                      };
                      $80.method = new Data_Either.Left(Data_HTTP_Method_1.POST.value);
                      $80.url = u;
                      $80.content = new Data_Maybe.Just(c);
                      return $80;
                  })());
              };
          };
      };
  };
  exports["affjax"] = affjax;
  exports["defaultRequest"] = defaultRequest;
  exports["post"] = post;
})(PS["Network.HTTP.Affjax"] = PS["Network.HTTP.Affjax"] || {});
(function(exports) {
  // Copyright 2016 Ian D. Bollinger
  //
  // Licensed under the MIT license <LICENSE or
  // http://opensource.org/licenses/MIT>. This file may not be copied, modified,
  // or distributed except according to those terms.

  "use strict";

  exports.session = function () {
    return window.sessionStorage;
  };

  exports.getItemForeign = function (key) {
    return function (storage) {
      return function () {
        return storage.getItem(key);
      };
    };
  };

  exports.setItem = function (key) {
    return function (value) {
      return function (storage) {
        return function () {
          storage.setItem(key, value);
        };
      };
    };
  };

  exports.removeItem = function (key) {
    return function (storage) {
      return function () {
        storage.removeItem(key);
      };
    };
  };
})(PS["Web.Storage"] = PS["Web.Storage"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var $foreign = PS["Web.Storage"];
  var Prelude = PS["Prelude"];
  var Control_Monad_Eff = PS["Control.Monad.Eff"];
  var Control_Monad_Eff_Exception = PS["Control.Monad.Eff.Exception"];
  var Data_Nullable_1 = PS["Data.Nullable"];
  var Data_Nullable_1 = PS["Data.Nullable"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Functor = PS["Data.Functor"];
  var getItem = function (key$prime) {
      return function (storage) {
          return Data_Functor.map(Control_Monad_Eff.functorEff)(Data_Nullable_1.toMaybe)($foreign.getItemForeign(key$prime)(storage));
      };
  };
  exports["getItem"] = getItem;
  exports["removeItem"] = $foreign.removeItem;
  exports["session"] = $foreign.session;
  exports["setItem"] = $foreign.setItem;
})(PS["Web.Storage"] = PS["Web.Storage"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Halogen = PS["Halogen"];
  var Network_HTTP_Affjax = PS["Network.HTTP.Affjax"];
  var Web_Storage = PS["Web.Storage"];        
  var authCookieName = "humblr-auth-cookie";
  var apiURL = "https://127.0.0.1:3000";
  exports["apiURL"] = apiURL;
  exports["authCookieName"] = authCookieName;
})(PS["Humblr.Config"] = PS["Humblr.Config"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Control_Monad_Aff = PS["Control.Monad.Aff"];
  var Control_Monad_Eff = PS["Control.Monad.Eff"];
  var Control_Monad_Eff_Class = PS["Control.Monad.Eff.Class"];
  var Control_Monad_Eff_Exception = PS["Control.Monad.Eff.Exception"];
  var Data_Argonaut_Core = PS["Data.Argonaut.Core"];
  var Data_Argonaut_Decode = PS["Data.Argonaut.Decode"];
  var Data_Argonaut_Decode_Combinators = PS["Data.Argonaut.Decode.Combinators"];
  var Data_Argonaut_Encode = PS["Data.Argonaut.Encode"];
  var Data_Argonaut_Encode_Combinators = PS["Data.Argonaut.Encode.Combinators"];
  var Data_Argonaut_Parser = PS["Data.Argonaut.Parser"];
  var Data_Argonaut_Printer = PS["Data.Argonaut.Printer"];
  var Data_Either = PS["Data.Either"];
  var Data_Maybe = PS["Data.Maybe"];
  var Halogen = PS["Halogen"];
  var Halogen_HTML_Indexed = PS["Halogen.HTML.Indexed"];
  var Halogen_HTML_Events_Indexed = PS["Halogen.HTML.Events.Indexed"];
  var Halogen_HTML_Properties_Indexed = PS["Halogen.HTML.Properties.Indexed"];
  var Network_HTTP_Affjax = PS["Network.HTTP.Affjax"];
  var Web_Storage = PS["Web.Storage"];
  var Humblr_Config = PS["Humblr.Config"];
  var Data_Argonaut_Encode_Class = PS["Data.Argonaut.Encode.Class"];
  var Data_Argonaut_Decode_Class = PS["Data.Argonaut.Decode.Class"];
  var Control_Bind = PS["Control.Bind"];
  var Data_Function = PS["Data.Function"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];
  var Control_Applicative = PS["Control.Applicative"];
  var Network_HTTP_Affjax_Request = PS["Network.HTTP.Affjax.Request"];
  var Network_HTTP_Affjax_Response = PS["Network.HTTP.Affjax.Response"];
  var Data_Semigroup = PS["Data.Semigroup"];
  var Halogen_HTML_Elements = PS["Halogen.HTML.Elements"];
  var Halogen_HTML_Elements_Indexed = PS["Halogen.HTML.Elements.Indexed"];
  var Halogen_HTML_Events = PS["Halogen.HTML.Events"];
  var Halogen_HTML = PS["Halogen.HTML"];
  var Data_Functor = PS["Data.Functor"];
  var Control_Monad_Free = PS["Control.Monad.Free"];
  var Halogen_Query = PS["Halogen.Query"];
  var Control_Monad_Aff_Free = PS["Control.Monad.Aff.Free"];
  var Halogen_Query_HalogenF = PS["Halogen.Query.HalogenF"];
  var Halogen_Component = PS["Halogen.Component"];
  var LoginResponse = function (x) {
      return x;
  };
  var SetUsername = (function () {
      function SetUsername(value0, value1) {
          this.value0 = value0;
          this.value1 = value1;
      };
      SetUsername.create = function (value0) {
          return function (value1) {
              return new SetUsername(value0, value1);
          };
      };
      return SetUsername;
  })();
  var SetPassword = (function () {
      function SetPassword(value0, value1) {
          this.value0 = value0;
          this.value1 = value1;
      };
      SetPassword.create = function (value0) {
          return function (value1) {
              return new SetPassword(value0, value1);
          };
      };
      return SetPassword;
  })();
  var Login = (function () {
      function Login(value0, value1, value2) {
          this.value0 = value0;
          this.value1 = value1;
          this.value2 = value2;
      };
      Login.create = function (value0) {
          return function (value1) {
              return function (value2) {
                  return new Login(value0, value1, value2);
              };
          };
      };
      return Login;
  })();
  var IsLoggedIn = (function () {
      function IsLoggedIn(value0) {
          this.value0 = value0;
      };
      IsLoggedIn.create = function (value0) {
          return new IsLoggedIn(value0);
      };
      return IsLoggedIn;
  })();
  var Logout = (function () {
      function Logout(value0) {
          this.value0 = value0;
      };
      Logout.create = function (value0) {
          return new Logout(value0);
      };
      return Logout;
  })();
  var saveSession = function (b) {
      return function (token) {
          return function __do() {
              var v = Web_Storage.session();
              return Data_Function.apply(Control_Monad_Eff_Exception["try"])(Web_Storage.setItem(Humblr_Config.authCookieName)(token)(v))();
          };
      };
  };
  var initialLoginState = {
      username: "", 
      password: "", 
      message: "", 
      loggedIn: false
  };
  var encodeJsonLoginUser = new Data_Argonaut_Encode_Class.EncodeJson(function (v) {
      return Data_Argonaut_Encode_Combinators.extend(Data_Argonaut_Encode_Class.encodeJsonJson)(Data_Argonaut_Encode_Combinators.assoc(Data_Argonaut_Encode_Class.encodeJsonJString)("username")(v.username))(Data_Argonaut_Encode_Combinators.extend(Data_Argonaut_Encode_Class.encodeJsonJson)(Data_Argonaut_Encode_Combinators.assoc(Data_Argonaut_Encode_Class.encodeJsonJString)("password")(v.password))(Data_Argonaut_Core.jsonEmptyObject));
  });
  var doLogout = function __do() {
      var v = Web_Storage.session();
      return Web_Storage.removeItem(Humblr_Config.authCookieName)(v)();
  };
  var decodeJsonEitherErrorToken = new Data_Argonaut_Decode_Class.DecodeJson(function (json) {
      return Control_Bind.bind(Data_Either.bindEither)(Data_Argonaut_Decode_Class.decodeJson(Data_Argonaut_Decode_Class.decodeStrMap(Data_Argonaut_Decode_Class.decodeJsonJson))(json))(function (v) {
          return Control_Bind.bind(Data_Either.bindEither)(Data_Argonaut_Decode_Combinators.getFieldOptional(Data_Argonaut_Decode_Class.decodeJsonString)(v)("token"))(function (v1) {
              if (v1 instanceof Data_Maybe.Just) {
                  return Data_Function.apply(function ($68) {
                      return Control_Applicative.pure(Data_Either.applicativeEither)(LoginResponse($68));
                  })(new Data_Either.Right(v1.value0));
              };
              if (v1 instanceof Data_Maybe.Nothing) {
                  return Control_Bind.bind(Data_Either.bindEither)(Data_Argonaut_Decode_Combinators.getField(Data_Argonaut_Decode_Class.decodeJsonString)(v)("error"))(function (v2) {
                      return Data_Function.apply(function ($69) {
                          return Control_Applicative.pure(Data_Either.applicativeEither)(LoginResponse($69));
                      })(new Data_Either.Left(v2));
                  });
              };
              throw new Error("Failed pattern match at Humblr.Components.Login line 44, column 9 - line 48, column 50: " + [ v1.constructor.name ]);
          });
      });
  });
  var doLogin = function (user) {
      return Control_Bind.bind(Control_Monad_Aff.bindAff)(Network_HTTP_Affjax.post(Network_HTTP_Affjax_Request.requestableJson)(Network_HTTP_Affjax_Response.responsableJson)(Humblr_Config.apiURL + "/login")(Data_Function.apply(Data_Argonaut_Encode_Class.encodeJson(encodeJsonLoginUser))(user)))(function (v) {
          return Data_Function.apply(Control_Applicative.pure(Control_Monad_Aff.applicativeAff))((function () {
              var $27 = Data_Argonaut_Decode_Class.decodeJson(decodeJsonEitherErrorToken)(v.response);
              if ($27 instanceof Data_Either.Right) {
                  return $27.value0;
              };
              if ($27 instanceof Data_Either.Left) {
                  return new Data_Either.Left($27.value0);
              };
              throw new Error("Failed pattern match at Humblr.Components.Login line 104, column 5 - line 106, column 29: " + [ $27.constructor.name ]);
          })());
      });
  };
  var loginComponent = (function () {
      var render = function (state) {
          if (state.loggedIn) {
              return Halogen_HTML_Elements.div_([ Halogen_HTML_Elements_Indexed.button([ Halogen_HTML_Properties_Indexed.buttonType(Halogen_HTML_Properties_Indexed.ButtonSubmit.value), Halogen_HTML_Events_Indexed.onClick(Halogen_HTML_Events.input_(Logout.create)) ])([ Halogen_HTML.text("Log out") ]) ]);
          };
          if (!state.loggedIn) {
              return Halogen_HTML_Elements.div_([ Halogen_HTML_Elements_Indexed.input([ Halogen_HTML_Properties_Indexed.inputType(Halogen_HTML_Properties_Indexed.InputText.value), Halogen_HTML_Properties_Indexed.name("username"), Halogen_HTML_Events_Indexed.onValueInput(Halogen_HTML_Events.input(SetUsername.create)) ]), Halogen_HTML_Elements_Indexed.input([ Halogen_HTML_Properties_Indexed.inputType(Halogen_HTML_Properties_Indexed.InputPassword.value), Halogen_HTML_Properties_Indexed.name("password"), Halogen_HTML_Events_Indexed.onValueInput(Halogen_HTML_Events.input(SetPassword.create)) ]), Halogen_HTML_Elements_Indexed.input([ Halogen_HTML_Properties_Indexed.inputType(Halogen_HTML_Properties_Indexed.InputSubmit.value), Halogen_HTML_Properties_Indexed.value("Log in"), Halogen_HTML_Events_Indexed.onClick(Data_Function.apply(Halogen_HTML_Events.input_)(Login.create(state.username)(state.password))) ]), Halogen_HTML_Elements.p_([ Halogen_HTML.text(state.message) ]) ]);
          };
          throw new Error("Failed pattern match at Humblr.Components.Login line 62, column 20 - line 73, column 14: " + [ state.loggedIn.constructor.name ]);
      };
      var $$eval = function (v) {
          if (v instanceof SetUsername) {
              return Data_Functor.voidLeft(Control_Monad_Free.freeFunctor)(Halogen_Query.modify(function (v1) {
                  var $32 = {};
                  for (var $33 in v1) {
                      if (v1.hasOwnProperty($33)) {
                          $32[$33] = v1[$33];
                      };
                  };
                  $32.username = v.value0;
                  $32.message = "";
                  return $32;
              }))(v.value1);
          };
          if (v instanceof SetPassword) {
              return Data_Functor.voidLeft(Control_Monad_Free.freeFunctor)(Halogen_Query.modify(function (v1) {
                  var $37 = {};
                  for (var $38 in v1) {
                      if (v1.hasOwnProperty($38)) {
                          $37[$38] = v1[$38];
                      };
                  };
                  $37.password = v.value0;
                  $37.message = "";
                  return $37;
              }))(v.value1);
          };
          if (v instanceof Login) {
              return Control_Bind.bind(Control_Monad_Free.freeBind)(Control_Monad_Aff_Free.fromAff(Control_Monad_Aff_Free.affableFree(Halogen_Query_HalogenF.affableHalogenF(Control_Monad_Aff_Free.affableAff)))(Data_Function.apply(doLogin)({
                  username: v.value0, 
                  password: v.value1
              })))(function (v1) {
                  return Control_Bind.bind(Control_Monad_Free.freeBind)((function () {
                      if (v1 instanceof Data_Either.Left) {
                          return Halogen_Query.modify(function (v2) {
                              var $44 = {};
                              for (var $45 in v2) {
                                  if (v2.hasOwnProperty($45)) {
                                      $44[$45] = v2[$45];
                                  };
                              };
                              $44.message = v1.value0;
                              return $44;
                          });
                      };
                      if (v1 instanceof Data_Either.Right) {
                          return Control_Bind.bind(Control_Monad_Free.freeBind)(Control_Monad_Aff_Free.fromEff(Control_Monad_Aff_Free.affableFree(Halogen_Query_HalogenF.affableHalogenF(Control_Monad_Aff_Free.affableAff)))(saveSession(false)(v1.value0)))(function (v2) {
                              if (v2 instanceof Data_Either.Left) {
                                  return Halogen_Query.modify(function (v3) {
                                      var $50 = {};
                                      for (var $51 in v3) {
                                          if (v3.hasOwnProperty($51)) {
                                              $50[$51] = v3[$51];
                                          };
                                      };
                                      $50.message = Control_Monad_Eff_Exception.message(v2.value0);
                                      return $50;
                                  });
                              };
                              if (v2 instanceof Data_Either.Right) {
                                  return Halogen_Query.modify(function (v3) {
                                      var $54 = {};
                                      for (var $55 in v3) {
                                          if (v3.hasOwnProperty($55)) {
                                              $54[$55] = v3[$55];
                                          };
                                      };
                                      $54.username = "";
                                      $54.password = "";
                                      $54.message = "";
                                      $54.loggedIn = true;
                                      return $54;
                                  });
                              };
                              throw new Error("Failed pattern match at Humblr.Components.Login line 84, column 17 - line 86, column 106: " + [ v2.constructor.name ]);
                          });
                      };
                      throw new Error("Failed pattern match at Humblr.Components.Login line 80, column 9 - line 86, column 106: " + [ v1.constructor.name ]);
                  })())(function () {
                      return Control_Applicative.pure(Control_Monad_Free.freeApplicative)(v.value2);
                  });
              });
          };
          if (v instanceof IsLoggedIn) {
              return Control_Bind.bind(Control_Monad_Free.freeBind)(Halogen_Query.gets(function (v1) {
                  return v1.loggedIn;
              }))(function (v1) {
                  return Data_Function.apply(Control_Applicative.pure(Control_Monad_Free.freeApplicative))(v.value0(v1));
              });
          };
          if (v instanceof Logout) {
              return Control_Bind.bind(Control_Monad_Free.freeBind)(Control_Monad_Aff_Free.fromEff(Control_Monad_Aff_Free.affableFree(Halogen_Query_HalogenF.affableHalogenF(Control_Monad_Aff_Free.affableAff)))(doLogout))(function () {
                  return Control_Bind.bind(Control_Monad_Free.freeBind)(Halogen_Query.modify(function (v1) {
                      var $64 = {};
                      for (var $65 in v1) {
                          if (v1.hasOwnProperty($65)) {
                              $64[$65] = v1[$65];
                          };
                      };
                      $64.loggedIn = false;
                      return $64;
                  }))(function () {
                      return Control_Applicative.pure(Control_Monad_Free.freeApplicative)(v.value0);
                  });
              });
          };
          throw new Error("Failed pattern match at Humblr.Components.Login line 76, column 5 - line 76, column 98: " + [ v.constructor.name ]);
      };
      return Halogen_Component.component({
          render: render, 
          "eval": $$eval
      });
  })();
  exports["SetUsername"] = SetUsername;
  exports["SetPassword"] = SetPassword;
  exports["Login"] = Login;
  exports["IsLoggedIn"] = IsLoggedIn;
  exports["Logout"] = Logout;
  exports["initialLoginState"] = initialLoginState;
  exports["loginComponent"] = loginComponent;
})(PS["Humblr.Components.Login"] = PS["Humblr.Components.Login"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Halogen = PS["Halogen"];
  var Halogen_HTML_Indexed = PS["Halogen.HTML.Indexed"];
  var Halogen_HTML_Properties_Indexed = PS["Halogen.HTML.Properties.Indexed"];
  var Halogen_HTML_Events_Indexed = PS["Halogen.HTML.Events.Indexed"];
  var Humblr_Config = PS["Humblr.Config"];
  var Halogen_HTML_Elements = PS["Halogen.HTML.Elements"];
  var Halogen_HTML = PS["Halogen.HTML"];
  var Halogen_HTML_Elements_Indexed = PS["Halogen.HTML.Elements.Indexed"];
  var Halogen_HTML_Events = PS["Halogen.HTML.Events"];
  var Data_Boolean = PS["Data.Boolean"];
  var Data_Function = PS["Data.Function"];
  var Data_Semigroup = PS["Data.Semigroup"];
  var Control_Bind = PS["Control.Bind"];
  var Control_Monad_Free = PS["Control.Monad.Free"];
  var Halogen_Query = PS["Halogen.Query"];
  var Control_Applicative = PS["Control.Applicative"];
  var Data_Unit = PS["Data.Unit"];
  var Halogen_Component = PS["Halogen.Component"];        
  var Edit = (function () {
      function Edit(value0) {
          this.value0 = value0;
      };
      Edit.create = function (value0) {
          return new Edit(value0);
      };
      return Edit;
  })();
  var Save = (function () {
      function Save(value0) {
          this.value0 = value0;
      };
      Save.create = function (value0) {
          return new Save(value0);
      };
      return Save;
  })();
  var SetBody = (function () {
      function SetBody(value0, value1) {
          this.value0 = value0;
          this.value1 = value1;
      };
      SetBody.create = function (value0) {
          return function (value1) {
              return new SetBody(value0, value1);
          };
      };
      return SetBody;
  })();
  var SetTitle = (function () {
      function SetTitle(value0, value1) {
          this.value0 = value0;
          this.value1 = value1;
      };
      SetTitle.create = function (value0) {
          return function (value1) {
              return new SetTitle(value0, value1);
          };
      };
      return SetTitle;
  })();
  var MarkDelete = (function () {
      function MarkDelete(value0) {
          this.value0 = value0;
      };
      MarkDelete.create = function (value0) {
          return new MarkDelete(value0);
      };
      return MarkDelete;
  })();
  var UnmarkDelete = (function () {
      function UnmarkDelete(value0) {
          this.value0 = value0;
      };
      UnmarkDelete.create = function (value0) {
          return new UnmarkDelete(value0);
      };
      return UnmarkDelete;
  })();
  var Delete = (function () {
      function Delete(value0) {
          this.value0 = value0;
      };
      Delete.create = function (value0) {
          return new Delete(value0);
      };
      return Delete;
  })();
  var postComponent = (function () {
      var renderDeleteConfirm = function (state) {
          if (state.markedForDelete) {
              return Halogen_HTML_Elements.div_([ Halogen_HTML_Elements.p_([ Halogen_HTML.text("Confirm delete") ]), Halogen_HTML_Elements_Indexed.button([ Halogen_HTML_Events_Indexed.onClick(Halogen_HTML_Events.input_(Delete.create)) ])([ Halogen_HTML.text("Yes") ]), Halogen_HTML_Elements_Indexed.button([ Halogen_HTML_Events_Indexed.onClick(Halogen_HTML_Events.input_(UnmarkDelete.create)) ])([ Halogen_HTML.text("No") ]) ]);
          };
          if (Data_Boolean.otherwise) {
              return Halogen_HTML_Elements_Indexed.button([ Halogen_HTML_Events_Indexed.onClick(Halogen_HTML_Events.input_(MarkDelete.create)) ])([ Halogen_HTML.text("Delete") ]);
          };
          throw new Error("Failed pattern match at Humblr.Components.Post line 49, column 5 - line 55, column 81: " + [ state.constructor.name ]);
      };
      var renderUpdatePost = function (state) {
          if (state.editable) {
              return [ Halogen_HTML_Elements_Indexed.button([ Halogen_HTML_Events_Indexed.onClick(Halogen_HTML_Events.input_(Edit.create)) ])([ Halogen_HTML.text("Edit") ]), renderDeleteConfirm(state) ];
          };
          if (Data_Boolean.otherwise) {
              return [  ];
          };
          throw new Error("Failed pattern match at Humblr.Components.Post line 58, column 5 - line 63, column 23: " + [ state.constructor.name ]);
      };
      var render = function (state) {
          if (state.editing) {
              return Halogen_HTML_Elements.div_([ Halogen_HTML_Elements.div_([ Halogen_HTML_Elements_Indexed.input([ Halogen_HTML_Properties_Indexed.inputType(Halogen_HTML_Properties_Indexed.InputText.value), Halogen_HTML_Properties_Indexed.value(state.title), Halogen_HTML_Events_Indexed.onValueChange(Halogen_HTML_Events.input(SetTitle.create)) ]) ]), Halogen_HTML_Elements.div_([ Halogen_HTML_Elements_Indexed.textarea([ Halogen_HTML_Properties_Indexed.value(state.body), Halogen_HTML_Events_Indexed.onValueChange(Halogen_HTML_Events.input(SetBody.create)) ]) ]), Halogen_HTML_Elements.div_([ Halogen_HTML_Elements_Indexed.button([ Halogen_HTML_Events_Indexed.onClick(Halogen_HTML_Events.input_(Save.create)) ])([ Halogen_HTML.text("Save") ]) ]) ]);
          };
          if (Data_Boolean.otherwise) {
              return Data_Function.apply(Halogen_HTML_Elements.div_)(Data_Semigroup.append(Data_Semigroup.semigroupArray)([ Halogen_HTML_Elements.h1_([ Halogen_HTML.text(state.title) ]), Halogen_HTML_Elements.p_([ Halogen_HTML.text(state.author) ]), Halogen_HTML_Elements.p_([ Halogen_HTML.text(state.body) ]) ])(renderUpdatePost(state)));
          };
          throw new Error("Failed pattern match at Humblr.Components.Post line 66, column 5 - line 86, column 40: " + [ state.constructor.name ]);
      };
      var $$eval = function (v) {
          if (v instanceof Edit) {
              return Control_Bind.bind(Control_Monad_Free.freeBind)(Halogen_Query.gets(function (v1) {
                  return v1.editable;
              }))(function (v1) {
                  return Control_Bind.bind(Control_Monad_Free.freeBind)(Data_Function.apply(Control_Applicative.when(Control_Monad_Free.freeApplicative)(v1))(Halogen_Query.modify(function (v2) {
                      var $18 = {};
                      for (var $19 in v2) {
                          if (v2.hasOwnProperty($19)) {
                              $18[$19] = v2[$19];
                          };
                      };
                      $18.editing = true;
                      return $18;
                  })))(function () {
                      return Control_Applicative.pure(Control_Monad_Free.freeApplicative)(v.value0);
                  });
              });
          };
          if (v instanceof Save) {
              return Control_Bind.bind(Control_Monad_Free.freeBind)(Halogen_Query.gets(function (v1) {
                  return v1.editable;
              }))(function (v1) {
                  return Control_Bind.bind(Control_Monad_Free.freeBind)(Control_Applicative.when(Control_Monad_Free.freeApplicative)(v1)(Halogen_Query.modify(function (v2) {
                      var $23 = {};
                      for (var $24 in v2) {
                          if (v2.hasOwnProperty($24)) {
                              $23[$24] = v2[$24];
                          };
                      };
                      $23.editing = false;
                      return $23;
                  })))(function () {
                      return Control_Applicative.pure(Control_Monad_Free.freeApplicative)(v.value0);
                  });
              });
          };
          if (v instanceof SetTitle) {
              return Control_Bind.bind(Control_Monad_Free.freeBind)(Halogen_Query.modify(function (v1) {
                  var $27 = {};
                  for (var $28 in v1) {
                      if (v1.hasOwnProperty($28)) {
                          $27[$28] = v1[$28];
                      };
                  };
                  $27.title = v.value0;
                  return $27;
              }))(function () {
                  return Control_Applicative.pure(Control_Monad_Free.freeApplicative)(v.value1);
              });
          };
          if (v instanceof SetBody) {
              return Control_Bind.bind(Control_Monad_Free.freeBind)(Halogen_Query.modify(function (v1) {
                  var $32 = {};
                  for (var $33 in v1) {
                      if (v1.hasOwnProperty($33)) {
                          $32[$33] = v1[$33];
                      };
                  };
                  $32.body = v.value0;
                  return $32;
              }))(function () {
                  return Control_Applicative.pure(Control_Monad_Free.freeApplicative)(v.value1);
              });
          };
          if (v instanceof MarkDelete) {
              return Control_Bind.bind(Control_Monad_Free.freeBind)(Halogen_Query.modify(function (v1) {
                  var $37 = {};
                  for (var $38 in v1) {
                      if (v1.hasOwnProperty($38)) {
                          $37[$38] = v1[$38];
                      };
                  };
                  $37.markedForDelete = true;
                  return $37;
              }))(function () {
                  return Control_Applicative.pure(Control_Monad_Free.freeApplicative)(v.value0);
              });
          };
          if (v instanceof UnmarkDelete) {
              return Control_Bind.bind(Control_Monad_Free.freeBind)(Halogen_Query.modify(function (v1) {
                  var $41 = {};
                  for (var $42 in v1) {
                      if (v1.hasOwnProperty($42)) {
                          $41[$42] = v1[$42];
                      };
                  };
                  $41.markedForDelete = false;
                  return $41;
              }))(function () {
                  return Control_Applicative.pure(Control_Monad_Free.freeApplicative)(v.value0);
              });
          };
          if (v instanceof Delete) {
              return Control_Bind.bind(Control_Monad_Free.freeBind)(Halogen_Query.gets(function (v1) {
                  return v1.markedForDelete;
              }))(function (v1) {
                  return Control_Bind.bind(Control_Monad_Free.freeBind)(Control_Applicative.when(Control_Monad_Free.freeApplicative)(v1)(Control_Applicative.pure(Control_Monad_Free.freeApplicative)(Data_Unit.unit)))(function () {
                      return Control_Applicative.pure(Control_Monad_Free.freeApplicative)(v.value0);
                  });
              });
          };
          throw new Error("Failed pattern match at Humblr.Components.Post line 89, column 5 - line 92, column 18: " + [ v.constructor.name ]);
      };
      return Halogen_Component.component({
          render: render, 
          "eval": $$eval
      });
  })();
  var initialPostState = function (pid) {
      return function (title) {
          return function (body) {
              return function (author) {
                  return function (editable) {
                      return {
                          id: pid, 
                          title: title, 
                          body: body, 
                          author: author, 
                          editable: editable, 
                          editing: false, 
                          markedForDelete: false
                      };
                  };
              };
          };
      };
  };
  exports["Edit"] = Edit;
  exports["Save"] = Save;
  exports["SetBody"] = SetBody;
  exports["SetTitle"] = SetTitle;
  exports["MarkDelete"] = MarkDelete;
  exports["UnmarkDelete"] = UnmarkDelete;
  exports["Delete"] = Delete;
  exports["initialPostState"] = initialPostState;
  exports["postComponent"] = postComponent;
})(PS["Humblr.Components.Post"] = PS["Humblr.Components.Post"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Data_Argonaut_Decode = PS["Data.Argonaut.Decode"];
  var Data_Array = PS["Data.Array"];
  var Data_Functor_Coproduct = PS["Data.Functor.Coproduct"];
  var Data_Generic = PS["Data.Generic"];
  var Data_Maybe = PS["Data.Maybe"];
  var Halogen = PS["Halogen"];
  var Halogen_HTML_Indexed = PS["Halogen.HTML.Indexed"];
  var Halogen_HTML_Properties_Indexed = PS["Halogen.HTML.Properties.Indexed"];
  var Halogen_HTML_Events_Indexed = PS["Halogen.HTML.Events.Indexed"];
  var Humblr_Components_Post = PS["Humblr.Components.Post"];
  var Data_Argonaut_Decode_Class = PS["Data.Argonaut.Decode.Class"];
  var Control_Bind = PS["Control.Bind"];
  var Data_Argonaut_Decode_Combinators = PS["Data.Argonaut.Decode.Combinators"];
  var Data_Function = PS["Data.Function"];
  var Control_Applicative = PS["Control.Applicative"];
  var Data_Eq = PS["Data.Eq"];
  var Data_Ord = PS["Data.Ord"];
  var Halogen_Component = PS["Halogen.Component"];
  var Control_Monad_Free = PS["Control.Monad.Free"];
  var Halogen_Query = PS["Halogen.Query"];
  var Data_Unit = PS["Data.Unit"];
  var Halogen_HTML = PS["Halogen.HTML"];
  var Halogen_HTML_Elements = PS["Halogen.HTML.Elements"];
  var Data_Functor = PS["Data.Functor"];
  var Data_Either = PS["Data.Either"];
  var Load = (function () {
      function Load(value0, value1, value2) {
          this.value0 = value0;
          this.value1 = value1;
          this.value2 = value2;
      };
      Load.create = function (value0) {
          return function (value1) {
              return function (value2) {
                  return new Load(value0, value1, value2);
              };
          };
      };
      return Load;
  })();
  var Clear = (function () {
      function Clear(value0) {
          this.value0 = value0;
      };
      Clear.create = function (value0) {
          return new Clear(value0);
      };
      return Clear;
  })();
  var initialPostListState = {
      username: Data_Maybe.Nothing.value, 
      posts: [  ]
  };
  var eqPostSlot = new Data_Eq.Eq(function (x) {
      return function (y) {
          return x === y;
      };
  });
  var ordPostSlot = new Data_Ord.Ord(function () {
      return eqPostSlot;
  }, function (x) {
      return function (y) {
          return Data_Ord.compare(Data_Ord.ordInt)(x)(y);
      };
  });
  var postListComponent = function (dictFunctor) {
      var removePost = function (v) {
          return function (state) {
              var $32 = {};
              for (var $33 in state) {
                  if (state.hasOwnProperty($33)) {
                      $32[$33] = state[$33];
                  };
              };
              $32.posts = Data_Array.filter(function (v1) {
                  return v1.id !== v;
              })(state.posts);
              return $32;
          };
      };
      var peek = function (v) {
          if (v.value1 instanceof Humblr_Components_Post.Delete) {
              return Control_Bind.bind(Control_Monad_Free.freeBind)(Halogen_Query.gets(function (v1) {
                  return v1.posts;
              }))(function (v1) {
                  return Data_Function.apply(Halogen_Query.modify)(removePost(v.value0));
              });
          };
          return Control_Applicative.pure(Control_Monad_Free.freeApplicative)(Data_Unit.unit);
      };
      var isAuthor = function (v) {
          return function (v1) {
              if (v instanceof Data_Maybe.Nothing) {
                  return false;
              };
              if (v instanceof Data_Maybe.Just) {
                  return v.value0 === v1;
              };
              throw new Error("Failed pattern match at Humblr.Components.PostList line 60, column 5 - line 60, column 31: " + [ v.constructor.name, v1.constructor.name ]);
          };
      };
      var renderPost = function (username) {
          return function (v) {
              return Halogen_HTML.slot(v.id)(function (v1) {
                  return {
                      component: Humblr_Components_Post.postComponent, 
                      initialState: Humblr_Components_Post.initialPostState(v.id)(v.title)(v.body)(v.author)(isAuthor(username)(v.author))
                  };
              });
          };
      };
      var render = function (state) {
          return Data_Function.apply(Halogen_HTML_Elements.div_)(Data_Functor.map(Data_Functor.functorArray)(renderPost(state.username))(state.posts));
      };
      var $$eval = function (v) {
          if (v instanceof Load) {
              return Control_Bind.bind(Control_Monad_Free.freeBind)(Halogen_Query.modify(function (v1) {
                  var $48 = {};
                  for (var $49 in v1) {
                      if (v1.hasOwnProperty($49)) {
                          $48[$49] = v1[$49];
                      };
                  };
                  $48.username = v.value0;
                  $48.posts = v.value1;
                  return $48;
              }))(function () {
                  return Control_Applicative.pure(Control_Monad_Free.freeApplicative)(v.value2);
              });
          };
          if (v instanceof Clear) {
              return Control_Bind.bind(Control_Monad_Free.freeBind)(Halogen_Query.set(initialPostListState))(function () {
                  return Control_Applicative.pure(Control_Monad_Free.freeApplicative)(v.value0);
              });
          };
          throw new Error("Failed pattern match at Humblr.Components.PostList line 80, column 5 - line 82, column 18: " + [ v.constructor.name ]);
      };
      return Data_Function.apply(Halogen_Component.parentComponent(dictFunctor)(ordPostSlot))({
          render: render, 
          "eval": $$eval, 
          peek: new Data_Maybe.Just(peek)
      });
  };
  var decodeJsonPost = new Data_Argonaut_Decode_Class.DecodeJson(function (json) {
      return Control_Bind.bind(Data_Either.bindEither)(Data_Argonaut_Decode_Class.decodeJson(Data_Argonaut_Decode_Class.decodeStrMap(Data_Argonaut_Decode_Class.decodeJsonJson))(json))(function (v) {
          return Control_Bind.bind(Data_Either.bindEither)(Data_Argonaut_Decode_Combinators.getField(Data_Argonaut_Decode_Class.decodeJsonInt)(v)("id"))(function (v1) {
              return Control_Bind.bind(Data_Either.bindEither)(Data_Argonaut_Decode_Combinators.getField(Data_Argonaut_Decode_Class.decodeJsonString)(v)("author"))(function (v2) {
                  return Control_Bind.bind(Data_Either.bindEither)(Data_Argonaut_Decode_Combinators.getField(Data_Argonaut_Decode_Class.decodeJsonString)(v)("title"))(function (v3) {
                      return Control_Bind.bind(Data_Either.bindEither)(Data_Argonaut_Decode_Combinators.getField(Data_Argonaut_Decode_Class.decodeJsonString)(v)("body"))(function (v4) {
                          return Data_Function.apply(Control_Applicative.pure(Data_Either.applicativeEither))({
                              id: v1, 
                              author: v2, 
                              title: v3, 
                              body: v4
                          });
                      });
                  });
              });
          });
      });
  });
  exports["Load"] = Load;
  exports["Clear"] = Clear;
  exports["initialPostListState"] = initialPostListState;
  exports["postListComponent"] = postListComponent;
  exports["decodeJsonPost"] = decodeJsonPost;
  exports["eqPostSlot"] = eqPostSlot;
  exports["ordPostSlot"] = ordPostSlot;
})(PS["Humblr.Components.PostList"] = PS["Humblr.Components.PostList"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Control_Monad_Aff = PS["Control.Monad.Aff"];
  var Control_Monad_Eff = PS["Control.Monad.Eff"];
  var Data_Argonaut_Decode = PS["Data.Argonaut.Decode"];
  var Data_Array = PS["Data.Array"];
  var Data_Either = PS["Data.Either"];
  var Data_Functor_Coproduct = PS["Data.Functor.Coproduct"];
  var Data_Maybe = PS["Data.Maybe"];
  var Data_Generic = PS["Data.Generic"];
  var Data_HTTP_Method = PS["Data.HTTP.Method"];
  var Halogen = PS["Halogen"];
  var Halogen_Component_ChildPath = PS["Halogen.Component.ChildPath"];
  var Halogen_HTML_Indexed = PS["Halogen.HTML.Indexed"];
  var Network_HTTP_Affjax = PS["Network.HTTP.Affjax"];
  var Network_HTTP_Affjax_Request = PS["Network.HTTP.Affjax.Request"];
  var Network_HTTP_Affjax_Response = PS["Network.HTTP.Affjax.Response"];
  var Network_HTTP_RequestHeader = PS["Network.HTTP.RequestHeader"];
  var Web_Storage = PS["Web.Storage"];
  var Humblr_Components_Login = PS["Humblr.Components.Login"];
  var Humblr_Components_PostList = PS["Humblr.Components.PostList"];
  var Humblr_Config = PS["Humblr.Config"];
  var Data_Argonaut_Decode_Class = PS["Data.Argonaut.Decode.Class"];
  var Control_Bind = PS["Control.Bind"];
  var Data_Argonaut_Decode_Combinators = PS["Data.Argonaut.Decode.Combinators"];
  var Data_Function = PS["Data.Function"];
  var Control_Applicative = PS["Control.Applicative"];
  var Halogen_HTML_Elements = PS["Halogen.HTML.Elements"];
  var Halogen_HTML = PS["Halogen.HTML"];
  var Data_Semigroup = PS["Data.Semigroup"];
  var Data_Unit = PS["Data.Unit"];
  var Halogen_Component = PS["Halogen.Component"];
  var Control_Monad_Free = PS["Control.Monad.Free"];
  var Data_Ord = PS["Data.Ord"];
  var Halogen_Query = PS["Halogen.Query"];
  var Control_Monad_Aff_Free = PS["Control.Monad.Aff.Free"];
  var Halogen_Query_HalogenF = PS["Halogen.Query.HalogenF"];
  var Control_Semigroupoid = PS["Control.Semigroupoid"];        
  var UserProfile = (function () {
      function UserProfile(value0) {
          this.value0 = value0;
      };
      UserProfile.create = function (value0) {
          return new UserProfile(value0);
      };
      return UserProfile;
  })();
  var initialDashboardState = {
      token: Data_Maybe.Nothing.value, 
      username: Data_Maybe.Nothing.value, 
      err: Data_Maybe.Nothing.value
  };
  var getToken = function __do() {
      var v = Web_Storage.session();
      return Web_Storage.getItem(Humblr_Config.authCookieName)(v)();
  };
  var getT = function (dictRespondable) {
      return function (token) {
          return function (url) {
              return Network_HTTP_Affjax.affjax(Network_HTTP_Affjax_Request.requestableUnit)(dictRespondable)((function () {
                  var $32 = {};
                  for (var $33 in Network_HTTP_Affjax.defaultRequest) {
                      if (Network_HTTP_Affjax.defaultRequest.hasOwnProperty($33)) {
                          $32[$33] = Network_HTTP_Affjax.defaultRequest[$33];
                      };
                  };
                  $32.method = new Data_Either.Left(Data_HTTP_Method.GET.value);
                  $32.headers = Data_Array.cons(new Network_HTTP_RequestHeader.RequestHeader("auth", token))(Network_HTTP_Affjax.defaultRequest.headers);
                  $32.url = url;
                  return $32;
              })());
          };
      };
  };
  var getPosts = function (token) {
      return Control_Bind.bind(Control_Monad_Aff.bindAff)(getT(Network_HTTP_Affjax_Response.responsableJson)(token)("/my/posts"))(function (v) {
          return Data_Function.apply(Control_Applicative.pure(Control_Monad_Aff.applicativeAff))(Data_Argonaut_Decode_Class.decodeJson(Data_Argonaut_Decode_Class.decodeArray(Humblr_Components_PostList.decodeJsonPost))(v.response));
      });
  };
  var decodeJsonUserProfile = new Data_Argonaut_Decode_Class.DecodeJson(function (json) {
      return Control_Bind.bind(Data_Either.bindEither)(Data_Argonaut_Decode_Class.decodeJson(Data_Argonaut_Decode_Class.decodeStrMap(Data_Argonaut_Decode_Class.decodeJsonJson))(json))(function (v) {
          return Control_Bind.bind(Data_Either.bindEither)(Data_Argonaut_Decode_Combinators.getField(Data_Argonaut_Decode_Class.decodeJsonString)(v)("username"))(function (v1) {
              return Data_Function.apply(Control_Applicative.pure(Data_Either.applicativeEither))(new UserProfile({
                  username: v1
              }));
          });
      });
  });
  var getMe = function (token) {
      return Control_Bind.bind(Control_Monad_Aff.bindAff)(getT(Network_HTTP_Affjax_Response.responsableJson)(token)("/me"))(function (v) {
          return Data_Function.apply(Control_Applicative.pure(Control_Monad_Aff.applicativeAff))(Data_Argonaut_Decode_Class.decodeJson(decodeJsonUserProfile)(v.response));
      });
  };
  var cpPostList = Halogen_Component_ChildPath.cpR;
  var cpLogin = Halogen_Component_ChildPath.cpL;
  var dashboardComponent = (function () {
      var renderUsername = function (v) {
          if (v instanceof Data_Maybe.Nothing) {
              return [  ];
          };
          if (v instanceof Data_Maybe.Just) {
              return [ Halogen_HTML_Elements.p_([ Halogen_HTML.text(v.value0) ]) ];
          };
          throw new Error("Failed pattern match at Humblr.Components.Dashboard line 61, column 5 - line 61, column 32: " + [ v.constructor.name ]);
      };
      var renderError = function (v) {
          if (v instanceof Data_Maybe.Nothing) {
              return [  ];
          };
          if (v instanceof Data_Maybe.Just) {
              return [ Halogen_HTML_Elements.p_([ Data_Function.apply(Halogen_HTML.text)("Error: " + v.value0) ]) ];
          };
          throw new Error("Failed pattern match at Humblr.Components.Dashboard line 67, column 5 - line 67, column 29: " + [ v.constructor.name ]);
      };
      var render = function (state) {
          return Data_Function.apply(Halogen_HTML_Elements.div_)(Data_Semigroup.append(Data_Semigroup.semigroupArray)(renderUsername(state.username))(Data_Semigroup.append(Data_Semigroup.semigroupArray)(renderError(state.err))(Data_Semigroup.append(Data_Semigroup.semigroupArray)([ Halogen_HTML["slot'"](Control_Monad_Aff.functorAff)(cpLogin)(Data_Unit.unit)(function (v) {
              return {
                  component: Humblr_Components_Login.loginComponent, 
                  initialState: Humblr_Components_Login.initialLoginState
              };
          }) ])([ Halogen_HTML["slot'"](Control_Monad_Aff.functorAff)(cpPostList)(Data_Unit.unit)(function (v) {
              return {
                  component: Humblr_Components_PostList.postListComponent(Control_Monad_Aff.functorAff), 
                  initialState: Halogen_Component.parentState(Humblr_Components_PostList.initialPostListState)
              };
          }) ]))));
      };
      var peek = function (v) {
          if (v.value0 instanceof Data_Either.Left && v.value1 instanceof Data_Either.Left) {
              if (v.value1.value0 instanceof Humblr_Components_Login.Login) {
                  return Control_Bind.bind(Control_Monad_Free.freeBind)(Data_Function.apply(Halogen_Component["query'"](Control_Monad_Aff.functorAff)(Data_Either.ordEither(Data_Ord.ordUnit)(Data_Ord.ordUnit))(cpLogin)(v.value0.value0))(Halogen_Query.request(Humblr_Components_Login.IsLoggedIn.create)))(function (v1) {
                      return Control_Applicative.when(Control_Monad_Free.freeApplicative)(Data_Maybe.fromMaybe(false)(v1))(Control_Bind.bind(Control_Monad_Free.freeBind)(Halogen_Query.get)(function (v2) {
                          return Control_Bind.bind(Control_Monad_Free.freeBind)((function () {
                              if (v2.token instanceof Data_Maybe.Nothing) {
                                  return Control_Bind.bind(Control_Monad_Free.freeBind)(Control_Monad_Aff_Free.fromEff(Control_Monad_Aff_Free.affableFree(Halogen_Query_HalogenF.affableHalogenF(Control_Monad_Aff_Free.affableFree(Halogen_Query_HalogenF.affableHalogenF(Control_Monad_Aff_Free.affableAff)))))(getToken))(function (v3) {
                                      return Halogen_Query.modify(function (v4) {
                                          var $51 = {};
                                          for (var $52 in v4) {
                                              if (v4.hasOwnProperty($52)) {
                                                  $51[$52] = v4[$52];
                                              };
                                          };
                                          $51.token = v3;
                                          return $51;
                                      });
                                  });
                              };
                              if (v2.token instanceof Data_Maybe.Just) {
                                  return Control_Applicative.pure(Control_Monad_Free.freeApplicative)(v.value0.value0);
                              };
                              throw new Error("Failed pattern match at Humblr.Components.Dashboard line 91, column 17 - line 95, column 45: " + [ v2.token.constructor.name ]);
                          })())(function () {
                              return Control_Bind.bind(Control_Monad_Free.freeBind)(Halogen_Query.get)(function (v3) {
                                  if (v3.token instanceof Data_Maybe.Nothing) {
                                      return Halogen_Query.modify(function (v4) {
                                          var $57 = {};
                                          for (var $58 in v4) {
                                              if (v4.hasOwnProperty($58)) {
                                                  $57[$58] = v4[$58];
                                              };
                                          };
                                          $57.err = new Data_Maybe.Just("Token disappeared");
                                          return $57;
                                      });
                                  };
                                  if (v3.token instanceof Data_Maybe.Just) {
                                      return Control_Bind.bind(Control_Monad_Free.freeBind)(Data_Function.apply(Control_Monad_Aff_Free.fromAff(Control_Monad_Aff_Free.affableFree(Halogen_Query_HalogenF.affableHalogenF(Control_Monad_Aff_Free.affableFree(Halogen_Query_HalogenF.affableHalogenF(Control_Monad_Aff_Free.affableAff))))))(getMe(v3.token.value0)))(function (v4) {
                                          return Control_Bind.bind(Control_Monad_Free.freeBind)((function () {
                                              if (v4 instanceof Data_Either.Right) {
                                                  return Halogen_Query.modify(function (v5) {
                                                      var $62 = {};
                                                      for (var $63 in v5) {
                                                          if (v5.hasOwnProperty($63)) {
                                                              $62[$63] = v5[$63];
                                                          };
                                                      };
                                                      $62.username = new Data_Maybe.Just(v4.value0.value0.username);
                                                      return $62;
                                                  });
                                              };
                                              if (v4 instanceof Data_Either.Left) {
                                                  return Halogen_Query.modify(function (v5) {
                                                      var $67 = {};
                                                      for (var $68 in v5) {
                                                          if (v5.hasOwnProperty($68)) {
                                                              $67[$68] = v5[$68];
                                                          };
                                                      };
                                                      $67.err = new Data_Maybe.Just(v4.value0);
                                                      return $67;
                                                  });
                                              };
                                              throw new Error("Failed pattern match at Humblr.Components.Dashboard line 102, column 25 - line 104, column 70: " + [ v4.constructor.name ]);
                                          })())(function () {
                                              return Control_Bind.bind(Control_Monad_Free.freeBind)(Data_Function.apply(Control_Monad_Aff_Free.fromAff(Control_Monad_Aff_Free.affableFree(Halogen_Query_HalogenF.affableHalogenF(Control_Monad_Aff_Free.affableFree(Halogen_Query_HalogenF.affableHalogenF(Control_Monad_Aff_Free.affableAff))))))(getPosts(v3.token.value0)))(function (v5) {
                                                  return Control_Bind.bind(Control_Monad_Free.freeBind)(Halogen_Query.gets(function (v6) {
                                                      return v6.username;
                                                  }))(function (v6) {
                                                      if (v5 instanceof Data_Either.Right) {
                                                          return Control_Bind.bind(Control_Monad_Free.freeBind)(Data_Function.apply(Halogen_Component["query'"](Control_Monad_Aff.functorAff)(Data_Either.ordEither(Data_Ord.ordUnit)(Data_Ord.ordUnit))(cpPostList)(v.value0.value0))(Halogen_Query.action(function ($91) {
                                                              return Data_Functor_Coproduct.Coproduct(Data_Either.Left.create(Humblr_Components_PostList.Load.create(v6)(v5.value0)($91)));
                                                          })))(function () {
                                                              return Control_Applicative.pure(Control_Monad_Free.freeApplicative)(v.value0.value0);
                                                          });
                                                      };
                                                      if (v5 instanceof Data_Either.Left) {
                                                          return Halogen_Query.modify(function (v7) {
                                                              var $75 = {};
                                                              for (var $76 in v7) {
                                                                  if (v7.hasOwnProperty($76)) {
                                                                      $75[$76] = v7[$76];
                                                                  };
                                                              };
                                                              $75.err = new Data_Maybe.Just(v5.value0);
                                                              return $75;
                                                          });
                                                      };
                                                      throw new Error("Failed pattern match at Humblr.Components.Dashboard line 107, column 25 - line 111, column 70: " + [ v5.constructor.name ]);
                                                  });
                                              });
                                          });
                                      });
                                  };
                                  throw new Error("Failed pattern match at Humblr.Components.Dashboard line 98, column 17 - line 111, column 70: " + [ v3.token.constructor.name ]);
                              });
                          });
                      }));
                  });
              };
              if (v.value1.value0 instanceof Humblr_Components_Login.Logout) {
                  return Control_Bind.bind(Control_Monad_Free.freeBind)(Data_Function.apply(Halogen_Component["query'"](Control_Monad_Aff.functorAff)(Data_Either.ordEither(Data_Ord.ordUnit)(Data_Ord.ordUnit))(cpPostList)(v.value0.value0))(Halogen_Query.action(function ($92) {
                      return Data_Functor_Coproduct.Coproduct(Data_Either.Left.create(Humblr_Components_PostList.Clear.create($92)));
                  })))(function () {
                      return Halogen_Query.modify(function (v1) {
                          return initialDashboardState;
                      });
                  });
              };
              return Control_Applicative.pure(Control_Monad_Free.freeApplicative)(v.value0.value0);
          };
          return Control_Applicative.pure(Control_Monad_Free.freeApplicative)(Data_Unit.unit);
      };
      var $$eval = function (v) {
          return Control_Applicative.pure(Control_Monad_Free.freeApplicative)(v.value0);
      };
      return Data_Function.apply(Halogen_Component.parentComponent(Control_Monad_Aff.functorAff)(Data_Either.ordEither(Data_Ord.ordUnit)(Data_Ord.ordUnit)))({
          render: render, 
          "eval": $$eval, 
          peek: new Data_Maybe.Just(peek)
      });
  })();
  exports["dashboardComponent"] = dashboardComponent;
  exports["initialDashboardState"] = initialDashboardState;
})(PS["Humblr.Components.Dashboard"] = PS["Humblr.Components.Dashboard"] || {});
(function(exports) {
  // Generated by psc version 0.9.3
  "use strict";
  var Prelude = PS["Prelude"];
  var Control_Monad_Eff = PS["Control.Monad.Eff"];
  var Halogen = PS["Halogen"];
  var Halogen_Util = PS["Halogen.Util"];
  var Humblr_Components_Dashboard = PS["Humblr.Components.Dashboard"];
  var Humblr_Config = PS["Humblr.Config"];
  var Control_Bind = PS["Control.Bind"];
  var Control_Monad_Aff = PS["Control.Monad.Aff"];
  var Halogen_Driver = PS["Halogen.Driver"];
  var Halogen_Component = PS["Halogen.Component"];
  var Control_Applicative = PS["Control.Applicative"];
  var Data_Unit = PS["Data.Unit"];        
  var main = Halogen_Util.runHalogenAff(Control_Bind.bind(Control_Monad_Aff.bindAff)(Halogen_Util.awaitBody)(function (v) {
      return Control_Bind.bind(Control_Monad_Aff.bindAff)(Halogen_Driver.runUI(Humblr_Components_Dashboard.dashboardComponent)(Halogen_Component.parentState(Humblr_Components_Dashboard.initialDashboardState))(v))(function (v1) {
          return Control_Applicative.pure(Control_Monad_Aff.applicativeAff)(Data_Unit.unit);
      });
  }));
  exports["main"] = main;
})(PS["Main"] = PS["Main"] || {});
PS["Main"].main();

},{"virtual-dom/create-element":3,"virtual-dom/diff":4,"virtual-dom/patch":5,"virtual-dom/virtual-hyperscript/hooks/soft-set-hook":12,"virtual-dom/vnode/vnode":20,"virtual-dom/vnode/vtext":22}],27:[function(require,module,exports){

},{}]},{},[26]);
