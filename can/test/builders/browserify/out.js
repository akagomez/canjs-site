(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*can*/
var can = require('./util/util.js');
require('./control/route/route.js');
require('./model/model.js');
require('./view/mustache/mustache.js');
require('./component/component.js');
module.exports = can;

},{"./component/component.js":2,"./control/route/route.js":6,"./model/model.js":11,"./util/util.js":23,"./view/mustache/mustache.js":28}],2:[function(require,module,exports){
/*component/component*/
var can = require('../util/util.js');
var viewCallbacks = require('../view/callbacks/callbacks.js');
require('../control/control.js');
require('../observe/observe.js');
require('../view/mustache/mustache.js');
require('../view/bindings/bindings.js');
var ignoreAttributesRegExp = /^(dataViewId|class|id)$/i, paramReplacer = /\{([^\}]+)\}/g;
var Component = can.Component = can.Construct.extend({
        setup: function () {
            can.Construct.setup.apply(this, arguments);
            if (can.Component) {
                var self = this, scope = this.prototype.scope;
                this.Control = ComponentControl.extend(this.prototype.events);
                if (!scope || typeof scope === 'object' && !(scope instanceof can.Map)) {
                    this.Map = can.Map.extend(scope || {});
                } else if (scope.prototype instanceof can.Map) {
                    this.Map = scope;
                }
                this.attributeScopeMappings = {};
                can.each(this.Map ? this.Map.defaults : {}, function (val, prop) {
                    if (val === '@') {
                        self.attributeScopeMappings[prop] = prop;
                    }
                });
                if (this.prototype.template) {
                    if (typeof this.prototype.template === 'function') {
                        var temp = this.prototype.template;
                        this.renderer = function () {
                            return can.view.frag(temp.apply(null, arguments));
                        };
                    } else {
                        this.renderer = can.view.mustache(this.prototype.template);
                    }
                }
                can.view.tag(this.prototype.tag, function (el, options) {
                    new self(el, options);
                });
            }
        }
    }, {
        setup: function (el, hookupOptions) {
            var initialScopeData = {}, component = this, twoWayBindings = {}, scopePropertyUpdating, componentScope, frag;
            can.each(this.constructor.attributeScopeMappings, function (val, prop) {
                initialScopeData[prop] = el.getAttribute(can.hyphenate(val));
            });
            can.each(can.makeArray(el.attributes), function (node, index) {
                var name = can.camelize(node.nodeName.toLowerCase()), value = node.value;
                if (component.constructor.attributeScopeMappings[name] || ignoreAttributesRegExp.test(name) || viewCallbacks.attr(node.nodeName)) {
                    return;
                }
                if (value[0] === '{' && value[value.length - 1] === '}') {
                    value = value.substr(1, value.length - 2);
                } else {
                    if (hookupOptions.templateType !== 'legacy') {
                        initialScopeData[name] = value;
                        return;
                    }
                }
                var computeData = hookupOptions.scope.computeData(value, { args: [] }), compute = computeData.compute;
                var handler = function (ev, newVal) {
                    scopePropertyUpdating = name;
                    componentScope.attr(name, newVal);
                    scopePropertyUpdating = null;
                };
                compute.bind('change', handler);
                initialScopeData[name] = compute();
                if (!compute.hasDependencies) {
                    compute.unbind('change', handler);
                } else {
                    can.bind.call(el, 'removed', function () {
                        compute.unbind('change', handler);
                    });
                    twoWayBindings[name] = computeData;
                }
            });
            if (this.constructor.Map) {
                componentScope = new this.constructor.Map(initialScopeData);
            } else if (this.scope instanceof can.Map) {
                componentScope = this.scope;
            } else if (can.isFunction(this.scope)) {
                var scopeResult = this.scope(initialScopeData, hookupOptions.scope, el);
                if (scopeResult instanceof can.Map) {
                    componentScope = scopeResult;
                } else if (scopeResult.prototype instanceof can.Map) {
                    componentScope = new scopeResult(initialScopeData);
                } else {
                    componentScope = new (can.Map.extend(scopeResult))(initialScopeData);
                }
            }
            var handlers = {};
            can.each(twoWayBindings, function (computeData, prop) {
                handlers[prop] = function (ev, newVal) {
                    if (scopePropertyUpdating !== prop) {
                        computeData.compute(newVal);
                    }
                };
                componentScope.bind(prop, handlers[prop]);
            });
            if (!can.isEmptyObject(this.constructor.attributeScopeMappings) || hookupOptions.templateType !== 'legacy') {
                can.bind.call(el, 'attributes', function (ev) {
                    var camelized = can.camelize(ev.attributeName);
                    if (!twoWayBindings[camelized] && !ignoreAttributesRegExp.test(camelized)) {
                        componentScope.attr(camelized, el.getAttribute(ev.attributeName));
                    }
                });
            }
            this.scope = componentScope;
            can.data(can.$(el), 'scope', this.scope);
            var renderedScope = hookupOptions.scope.add(this.scope), options = { helpers: {} };
            can.each(this.helpers || {}, function (val, prop) {
                if (can.isFunction(val)) {
                    options.helpers[prop] = function () {
                        return val.apply(componentScope, arguments);
                    };
                }
            });
            var tearDownBindings = function () {
                can.each(handlers, function (handler, prop) {
                    componentScope.unbind(prop, handlers[prop]);
                });
            };
            this._control = new this.constructor.Control(el, { scope: this.scope });
            if (this._control && this._control.destroy) {
                var oldDestroy = this._control.destroy;
                this._control.destroy = function () {
                    oldDestroy.apply(this, arguments);
                    tearDownBindings();
                };
                this._control.on();
            } else {
                can.bind.call(el, 'removed', function () {
                    tearDownBindings();
                });
            }
            if (this.constructor.renderer) {
                if (!options.tags) {
                    options.tags = {};
                }
                options.tags.content = function contentHookup(el, rendererOptions) {
                    var subtemplate = hookupOptions.subtemplate || rendererOptions.subtemplate;
                    if (subtemplate) {
                        delete options.tags.content;
                        can.view.live.replace([el], subtemplate(rendererOptions.scope, rendererOptions.options));
                        options.tags.content = contentHookup;
                    }
                };
                frag = this.constructor.renderer(renderedScope, hookupOptions.options.add(options));
            } else {
                if (hookupOptions.templateType === 'legacy') {
                    frag = can.view.frag(hookupOptions.subtemplate ? hookupOptions.subtemplate(renderedScope, hookupOptions.options.add(options)) : '');
                } else {
                    frag = hookupOptions.subtemplate ? hookupOptions.subtemplate(renderedScope, hookupOptions.options.add(options)) : document.createDocumentFragment();
                }
            }
            can.appendChild(el, frag);
        }
    });
var ComponentControl = can.Control.extend({
        _lookup: function (options) {
            return [
                options.scope,
                options,
                window
            ];
        },
        _action: function (methodName, options, controlInstance) {
            var hasObjectLookup, readyCompute;
            paramReplacer.lastIndex = 0;
            hasObjectLookup = paramReplacer.test(methodName);
            if (!controlInstance && hasObjectLookup) {
                return;
            } else if (!hasObjectLookup) {
                return can.Control._action.apply(this, arguments);
            } else {
                readyCompute = can.compute(function () {
                    var delegate;
                    var name = methodName.replace(paramReplacer, function (matched, key) {
                            var value;
                            if (key === 'scope') {
                                delegate = options.scope;
                                return '';
                            }
                            key = key.replace(/^scope\./, '');
                            value = can.compute.read(options.scope, key.split('.'), { isArgument: true }).value;
                            if (value === undefined) {
                                value = can.getObject(key);
                            }
                            if (typeof value === 'string') {
                                return value;
                            } else {
                                delegate = value;
                                return '';
                            }
                        });
                    var parts = name.split(/\s+/g), event = parts.pop();
                    return {
                        processor: this.processors[event] || this.processors.click,
                        parts: [
                            name,
                            parts.join(' '),
                            event
                        ],
                        delegate: delegate || undefined
                    };
                }, this);
                var handler = function (ev, ready) {
                    controlInstance._bindings.control[methodName](controlInstance.element);
                    controlInstance._bindings.control[methodName] = ready.processor(ready.delegate || controlInstance.element, ready.parts[2], ready.parts[1], methodName, controlInstance);
                };
                readyCompute.bind('change', handler);
                controlInstance._bindings.readyComputes[methodName] = {
                    compute: readyCompute,
                    handler: handler
                };
                return readyCompute();
            }
        }
    }, {
        setup: function (el, options) {
            this.scope = options.scope;
            return can.Control.prototype.setup.call(this, el, options);
        },
        off: function () {
            if (this._bindings) {
                can.each(this._bindings.readyComputes || {}, function (value) {
                    value.compute.unbind('change', value.handler);
                });
            }
            can.Control.prototype.off.apply(this, arguments);
            this._bindings.readyComputes = {};
        }
    });
if (can.$.fn) {
    can.$.fn.scope = function (attr) {
        var scope = this.data('scope');
        if (!scope) {
            scope = new can.Map();
            this.data('scope', scope);
        }
        if (attr) {
            return scope.attr(attr);
        } else {
            return scope;
        }
    };
}
module.exports = Component;

},{"../control/control.js":5,"../observe/observe.js":12,"../util/util.js":23,"../view/bindings/bindings.js":24,"../view/callbacks/callbacks.js":25,"../view/mustache/mustache.js":28}],3:[function(require,module,exports){
/*compute/compute*/
var can = require('../util/util.js');
var bind = require('../util/bind/bind.js');
require('../util/batch/batch.js');
var stack = [];
can.__read = function (func, self) {
    stack.push({});
    var value = func.call(self);
    return {
        value: value,
        observed: stack.pop()
    };
};
can.__reading = function (obj, event) {
    if (stack.length) {
        stack[stack.length - 1][obj._cid + '|' + event] = {
            obj: obj,
            event: event + ''
        };
    }
};
can.__clearReading = function () {
    if (stack.length) {
        var ret = stack[stack.length - 1];
        stack[stack.length - 1] = {};
        return ret;
    }
};
can.__setReading = function (o) {
    if (stack.length) {
        stack[stack.length - 1] = o;
    }
};
can.__addReading = function (o) {
    if (stack.length) {
        can.simpleExtend(stack[stack.length - 1], o);
    }
};
var getValueAndBind = function (func, context, oldObserved, onchanged) {
    var info = can.__read(func, context), newObserveSet = info.observed;
    bindNewSet(oldObserved, newObserveSet, onchanged);
    unbindOldSet(oldObserved, onchanged);
    return info;
};
var bindNewSet = function (oldObserved, newObserveSet, onchanged) {
    for (var name in newObserveSet) {
        bindOrPreventUnbinding(oldObserved, newObserveSet, name, onchanged);
    }
};
var bindOrPreventUnbinding = function (oldObserved, newObserveSet, name, onchanged) {
    if (oldObserved[name]) {
        delete oldObserved[name];
    } else {
        var obEv = newObserveSet[name];
        obEv.obj.bind(obEv.event, onchanged);
    }
};
var unbindOldSet = function (oldObserved, onchanged) {
    for (var name in oldObserved) {
        var obEv = oldObserved[name];
        obEv.obj.unbind(obEv.event, onchanged);
    }
};
var updateOnChange = function (compute, newValue, oldValue, batchNum) {
    if (newValue !== oldValue) {
        can.batch.trigger(compute, batchNum ? {
            type: 'change',
            batchNum: batchNum
        } : 'change', [
            newValue,
            oldValue
        ]);
    }
};
var setupComputeHandlers = function (compute, func, context, setCachedValue) {
    var readInfo, onchanged, batchNum;
    return {
        on: function (updater) {
            if (!onchanged) {
                onchanged = function (ev) {
                    if (compute.bound && (ev.batchNum === undefined || ev.batchNum !== batchNum)) {
                        var oldValue = readInfo.value;
                        readInfo = getValueAndBind(func, context, readInfo.observed, onchanged);
                        updater(readInfo.value, oldValue, ev.batchNum);
                        batchNum = batchNum = ev.batchNum;
                    }
                };
            }
            readInfo = getValueAndBind(func, context, {}, onchanged);
            setCachedValue(readInfo.value);
            compute.hasDependencies = !can.isEmptyObject(readInfo.observed);
        },
        off: function (updater) {
            for (var name in readInfo.observed) {
                var ob = readInfo.observed[name];
                ob.obj.unbind(ob.event, onchanged);
            }
        }
    };
};
var setupSingleBindComputeHandlers = function (compute, func, context, setCachedValue) {
    var readInfo, oldValue, onchanged, batchNum;
    return {
        on: function (updater) {
            if (!onchanged) {
                onchanged = function (ev) {
                    if (compute.bound && (ev.batchNum === undefined || ev.batchNum !== batchNum)) {
                        var reads = can.__clearReading();
                        var newValue = func.call(context);
                        can.__setReading(reads);
                        updater(newValue, oldValue, ev.batchNum);
                        oldValue = newValue;
                        batchNum = batchNum = ev.batchNum;
                    }
                };
            }
            readInfo = getValueAndBind(func, context, {}, onchanged);
            oldValue = readInfo.value;
            setCachedValue(readInfo.value);
            compute.hasDependencies = !can.isEmptyObject(readInfo.observed);
        },
        off: function (updater) {
            for (var name in readInfo.observed) {
                var ob = readInfo.observed[name];
                ob.obj.unbind(ob.event, onchanged);
            }
        }
    };
};
var isObserve = function (obj) {
        return obj instanceof can.Map || obj && obj.__get;
    }, k = function () {
    };
can.compute = function (getterSetter, context, eventName, bindOnce) {
    if (getterSetter && getterSetter.isComputed) {
        return getterSetter;
    }
    var computed, on = k, off = k, value, get = function () {
            return value;
        }, set = function (newVal) {
            value = newVal;
        }, setCached = set, args = [], updater = function (newValue, oldValue, batchNum) {
            setCached(newValue);
            updateOnChange(computed, newValue, oldValue, batchNum);
        }, form;
    for (var i = 0, arglen = arguments.length; i < arglen; i++) {
        args[i] = arguments[i];
    }
    computed = function (newVal) {
        if (arguments.length) {
            var old = value;
            var setVal = set.call(context, newVal, old);
            if (computed.hasDependencies) {
                return get.call(context);
            }
            if (setVal === undefined) {
                value = get.call(context);
            } else {
                value = setVal;
            }
            updateOnChange(computed, value, old);
            return value;
        } else {
            if (stack.length && computed.canReadForChangeEvent !== false) {
                can.__reading(computed, 'change');
                if (!computed.bound) {
                    can.compute.temporarilyBind(computed);
                }
            }
            if (computed.bound) {
                return value;
            } else {
                return get.call(context);
            }
        }
    };
    if (typeof getterSetter === 'function') {
        set = getterSetter;
        get = getterSetter;
        computed.canReadForChangeEvent = eventName === false ? false : true;
        var handlers = bindOnce ? setupSingleBindComputeHandlers(computed, getterSetter, context || this, setCached) : setupComputeHandlers(computed, getterSetter, context || this, setCached);
        on = handlers.on;
        off = handlers.off;
    } else if (context) {
        if (typeof context === 'string') {
            var propertyName = context, isObserve = getterSetter instanceof can.Map;
            if (isObserve) {
                computed.hasDependencies = true;
                var handler;
                get = function () {
                    return getterSetter.attr(propertyName);
                };
                set = function (newValue) {
                    getterSetter.attr(propertyName, newValue);
                };
                on = function (update) {
                    handler = function (ev, newVal, oldVal) {
                        update(newVal, oldVal, ev.batchNum);
                    };
                    getterSetter.bind(eventName || propertyName, handler);
                    value = can.__read(get).value;
                };
                off = function (update) {
                    getterSetter.unbind(eventName || propertyName, handler);
                };
            } else {
                get = function () {
                    return getterSetter[propertyName];
                };
                set = function (newValue) {
                    getterSetter[propertyName] = newValue;
                };
                on = function (update) {
                    handler = function () {
                        update(get(), value);
                    };
                    can.bind.call(getterSetter, eventName || propertyName, handler);
                    value = can.__read(get).value;
                };
                off = function (update) {
                    can.unbind.call(getterSetter, eventName || propertyName, handler);
                };
            }
        } else {
            if (typeof context === 'function') {
                value = getterSetter;
                set = context;
                context = eventName;
                form = 'setter';
            } else {
                value = getterSetter;
                var options = context, oldUpdater = updater;
                context = options.context || options;
                get = options.get || get;
                set = options.set || function () {
                    return value;
                };
                if (options.fn) {
                    var fn = options.fn, data;
                    get = function () {
                        return fn.call(context, value);
                    };
                    if (fn.length === 0) {
                        data = setupComputeHandlers(computed, fn, context, setCached);
                    } else if (fn.length === 1) {
                        data = setupComputeHandlers(computed, function () {
                            return fn.call(context, value);
                        }, context, setCached);
                    } else {
                        updater = function (newVal) {
                            if (newVal !== undefined) {
                                oldUpdater(newVal, value);
                            }
                        };
                        data = setupComputeHandlers(computed, function () {
                            var res = fn.call(context, value, function (newVal) {
                                    oldUpdater(newVal, value);
                                });
                            return res !== undefined ? res : value;
                        }, context, setCached);
                    }
                    on = data.on;
                    off = data.off;
                } else {
                    updater = function () {
                        var newVal = get.call(context);
                        oldUpdater(newVal, value);
                    };
                }
                on = options.on || on;
                off = options.off || off;
            }
        }
    } else {
        value = getterSetter;
    }
    can.cid(computed, 'compute');
    return can.simpleExtend(computed, {
        isComputed: true,
        _bindsetup: function () {
            this.bound = true;
            var oldReading = can.__clearReading();
            on.call(this, updater);
            can.__setReading(oldReading);
        },
        _bindteardown: function () {
            off.call(this, updater);
            this.bound = false;
        },
        bind: can.bindAndSetup,
        unbind: can.unbindAndTeardown,
        clone: function (context) {
            if (context) {
                if (form === 'setter') {
                    args[2] = context;
                } else {
                    args[1] = context;
                }
            }
            return can.compute.apply(can, args);
        }
    });
};
var computes, unbindComputes = function () {
        for (var i = 0, len = computes.length; i < len; i++) {
            computes[i].unbind('change', k);
        }
        computes = null;
    };
can.compute.temporarilyBind = function (compute) {
    compute.bind('change', k);
    if (!computes) {
        computes = [];
        setTimeout(unbindComputes, 10);
    }
    computes.push(compute);
};
can.compute.truthy = function (compute) {
    return can.compute(function () {
        var res = compute();
        if (typeof res === 'function') {
            res = res();
        }
        return !!res;
    });
};
can.compute.async = function (initialValue, asyncComputer, context) {
    return can.compute(initialValue, {
        fn: asyncComputer,
        context: context
    });
};
can.compute.read = function (parent, reads, options) {
    options = options || {};
    var cur = parent, type, prev, foundObs;
    for (var i = 0, readLength = reads.length; i < readLength; i++) {
        prev = cur;
        if (prev && prev.isComputed) {
            if (options.foundObservable) {
                options.foundObservable(prev, i);
            }
            prev = cur = prev();
        }
        if (isObserve(prev)) {
            if (!foundObs && options.foundObservable) {
                options.foundObservable(prev, i);
            }
            foundObs = 1;
            if (typeof prev[reads[i]] === 'function' && prev.constructor.prototype[reads[i]] === prev[reads[i]]) {
                if (options.returnObserveMethods) {
                    cur = cur[reads[i]];
                } else if (reads[i] === 'constructor' && prev instanceof can.Construct || prev[reads[i]].prototype instanceof can.Construct) {
                    cur = prev[reads[i]];
                } else {
                    cur = prev[reads[i]].apply(prev, options.args || []);
                }
            } else {
                cur = cur.attr(reads[i]);
            }
        } else {
            if (cur == null) {
                cur = undefined;
            } else {
                cur = prev[reads[i]];
            }
        }
        type = typeof cur;
        if (cur && cur.isComputed && (!options.isArgument && i < readLength - 1)) {
            if (!foundObs && options.foundObservable) {
                options.foundObservable(prev, i + 1);
            }
            cur = cur();
        } else if (i < reads.length - 1 && type === 'function' && options.executeAnonymousFunctions && !(can.Construct && cur.prototype instanceof can.Construct)) {
            cur = cur();
        }
        if (i < reads.length - 1 && (cur === null || type !== 'function' && type !== 'object')) {
            if (options.earlyExit) {
                options.earlyExit(prev, i, cur);
            }
            return {
                value: undefined,
                parent: prev
            };
        }
    }
    if (typeof cur === 'function' && !(can.Construct && cur.prototype instanceof can.Construct) && !(can.route && cur === can.route)) {
        if (options.isArgument) {
            if (!cur.isComputed && options.proxyMethods !== false) {
                cur = can.proxy(cur, prev);
            }
        } else {
            if (cur.isComputed && !foundObs && options.foundObservable) {
                options.foundObservable(cur, i);
            }
            cur = cur.call(prev);
        }
    }
    if (cur === undefined) {
        if (options.earlyExit) {
            options.earlyExit(prev, i - 1);
        }
    }
    return {
        value: cur,
        parent: prev
    };
};
can.compute.set = function (parent, key, value) {
    if (isObserve(parent)) {
        return parent.attr(key, value);
    }
    if (parent[key] && parent[key].isComputed) {
        return parent[key](value);
    }
    if (typeof parent === 'object') {
        parent[key] = value;
    }
};
module.exports = can.compute;

},{"../util/batch/batch.js":16,"../util/bind/bind.js":17,"../util/util.js":23}],4:[function(require,module,exports){
/*construct/construct*/
var can = require('../util/string/string.js');
var initializing = 0;
var canGetDescriptor;
try {
    Object.getOwnPropertyDescriptor({});
    canGetDescriptor = true;
} catch (e) {
    canGetDescriptor = false;
}
var getDescriptor = function (newProps, name) {
        var descriptor = Object.getOwnPropertyDescriptor(newProps, name);
        if (descriptor && (descriptor.get || descriptor.set)) {
            return descriptor;
        }
        return null;
    }, inheritGetterSetter = function (newProps, oldProps, addTo) {
        addTo = addTo || newProps;
        var descriptor;
        for (var name in newProps) {
            if (descriptor = getDescriptor(newProps, name)) {
                this._defineProperty(addTo, oldProps, name, descriptor);
            } else {
                can.Construct._overwrite(addTo, oldProps, name, newProps[name]);
            }
        }
    }, simpleInherit = function (newProps, oldProps, addTo) {
        addTo = addTo || newProps;
        for (var name in newProps) {
            can.Construct._overwrite(addTo, oldProps, name, newProps[name]);
        }
    };
can.Construct = function () {
    if (arguments.length) {
        return can.Construct.extend.apply(can.Construct, arguments);
    }
};
can.extend(can.Construct, {
    constructorExtends: true,
    newInstance: function () {
        var inst = this.instance(), args;
        if (inst.setup) {
            args = inst.setup.apply(inst, arguments);
        }
        if (inst.init) {
            inst.init.apply(inst, args || arguments);
        }
        return inst;
    },
    _inherit: canGetDescriptor ? inheritGetterSetter : simpleInherit,
    _defineProperty: function (what, oldProps, propName, descriptor) {
        Object.defineProperty(what, propName, descriptor);
    },
    _overwrite: function (what, oldProps, propName, val) {
        what[propName] = val;
    },
    setup: function (base, fullName) {
        this.defaults = can.extend(true, {}, base.defaults, this.defaults);
    },
    instance: function () {
        initializing = 1;
        var inst = new this();
        initializing = 0;
        return inst;
    },
    extend: function (name, staticProperties, instanceProperties) {
        var fullName = name, klass = staticProperties, proto = instanceProperties;
        if (typeof fullName !== 'string') {
            proto = klass;
            klass = fullName;
            fullName = null;
        }
        if (!proto) {
            proto = klass;
            klass = null;
        }
        proto = proto || {};
        var _super_class = this, _super = this.prototype, Constructor, parts, current, _fullName, _shortName, propName, shortName, namespace, prototype;
        prototype = this.instance();
        can.Construct._inherit(proto, _super, prototype);
        if (fullName) {
            parts = fullName.split('.');
            shortName = parts.pop();
        }
        if (typeof constructorName === 'undefined') {
            Constructor = function () {
                return init.apply(this, arguments);
            };
        }
        function init() {
            if (!initializing) {
                return this.constructor !== Constructor && arguments.length && Constructor.constructorExtends ? Constructor.extend.apply(Constructor, arguments) : Constructor.newInstance.apply(Constructor, arguments);
            }
        }
        for (propName in _super_class) {
            if (_super_class.hasOwnProperty(propName)) {
                Constructor[propName] = _super_class[propName];
            }
        }
        can.Construct._inherit(klass, _super_class, Constructor);
        if (fullName) {
            current = can.getObject(parts.join('.'), window, true);
            namespace = current;
            _fullName = can.underscore(fullName.replace(/\./g, '_'));
            _shortName = can.underscore(shortName);
            current[shortName] = Constructor;
        }
        can.extend(Constructor, {
            constructor: Constructor,
            prototype: prototype,
            namespace: namespace,
            _shortName: _shortName,
            fullName: fullName,
            _fullName: _fullName
        });
        if (shortName !== undefined) {
            Constructor.shortName = shortName;
        }
        Constructor.prototype.constructor = Constructor;
        var t = [_super_class].concat(can.makeArray(arguments)), args = Constructor.setup.apply(Constructor, t);
        if (Constructor.init) {
            Constructor.init.apply(Constructor, args || t);
        }
        return Constructor;
    }
});
can.Construct.prototype.setup = function () {
};
can.Construct.prototype.init = function () {
};
module.exports = can.Construct;

},{"../util/string/string.js":22}],5:[function(require,module,exports){
/*control/control*/
var can = require('../util/util.js');
require('../construct/construct.js');
var bind = function (el, ev, callback) {
        can.bind.call(el, ev, callback);
        return function () {
            can.unbind.call(el, ev, callback);
        };
    }, isFunction = can.isFunction, extend = can.extend, each = can.each, slice = [].slice, paramReplacer = /\{([^\}]+)\}/g, special = can.getObject('$.event.special', [can]) || {}, delegate = function (el, selector, ev, callback) {
        can.delegate.call(el, selector, ev, callback);
        return function () {
            can.undelegate.call(el, selector, ev, callback);
        };
    }, binder = function (el, ev, callback, selector) {
        return selector ? delegate(el, can.trim(selector), ev, callback) : bind(el, ev, callback);
    }, basicProcessor;
var Control = can.Control = can.Construct({
        setup: function () {
            can.Construct.setup.apply(this, arguments);
            if (can.Control) {
                var control = this, funcName;
                control.actions = {};
                for (funcName in control.prototype) {
                    if (control._isAction(funcName)) {
                        control.actions[funcName] = control._action(funcName);
                    }
                }
            }
        },
        _shifter: function (context, name) {
            var method = typeof name === 'string' ? context[name] : name;
            if (!isFunction(method)) {
                method = context[method];
            }
            return function () {
                context.called = name;
                return method.apply(context, [this.nodeName ? can.$(this) : this].concat(slice.call(arguments, 0)));
            };
        },
        _isAction: function (methodName) {
            var val = this.prototype[methodName], type = typeof val;
            return methodName !== 'constructor' && (type === 'function' || type === 'string' && isFunction(this.prototype[val])) && !!(special[methodName] || processors[methodName] || /[^\w]/.test(methodName));
        },
        _action: function (methodName, options) {
            paramReplacer.lastIndex = 0;
            if (options || !paramReplacer.test(methodName)) {
                var convertedName = options ? can.sub(methodName, this._lookup(options)) : methodName;
                if (!convertedName) {
                    return null;
                }
                var arr = can.isArray(convertedName), name = arr ? convertedName[1] : convertedName, parts = name.split(/\s+/g), event = parts.pop();
                return {
                    processor: processors[event] || basicProcessor,
                    parts: [
                        name,
                        parts.join(' '),
                        event
                    ],
                    delegate: arr ? convertedName[0] : undefined
                };
            }
        },
        _lookup: function (options) {
            return [
                options,
                window
            ];
        },
        processors: {},
        defaults: {}
    }, {
        setup: function (element, options) {
            var cls = this.constructor, pluginname = cls.pluginName || cls._fullName, arr;
            this.element = can.$(element);
            if (pluginname && pluginname !== 'can_control') {
                this.element.addClass(pluginname);
            }
            arr = can.data(this.element, 'controls');
            if (!arr) {
                arr = [];
                can.data(this.element, 'controls', arr);
            }
            arr.push(this);
            this.options = extend({}, cls.defaults, options);
            this.on();
            return [
                this.element,
                this.options
            ];
        },
        on: function (el, selector, eventName, func) {
            if (!el) {
                this.off();
                var cls = this.constructor, bindings = this._bindings, actions = cls.actions, element = this.element, destroyCB = can.Control._shifter(this, 'destroy'), funcName, ready;
                for (funcName in actions) {
                    if (actions.hasOwnProperty(funcName)) {
                        ready = actions[funcName] || cls._action(funcName, this.options, this);
                        if (ready) {
                            bindings.control[funcName] = ready.processor(ready.delegate || element, ready.parts[2], ready.parts[1], funcName, this);
                        }
                    }
                }
                can.bind.call(element, 'removed', destroyCB);
                bindings.user.push(function (el) {
                    can.unbind.call(el, 'removed', destroyCB);
                });
                return bindings.user.length;
            }
            if (typeof el === 'string') {
                func = eventName;
                eventName = selector;
                selector = el;
                el = this.element;
            }
            if (func === undefined) {
                func = eventName;
                eventName = selector;
                selector = null;
            }
            if (typeof func === 'string') {
                func = can.Control._shifter(this, func);
            }
            this._bindings.user.push(binder(el, eventName, func, selector));
            return this._bindings.user.length;
        },
        off: function () {
            var el = this.element[0], bindings = this._bindings;
            if (bindings) {
                each(bindings.user || [], function (value) {
                    value(el);
                });
                each(bindings.control || {}, function (value) {
                    value(el);
                });
            }
            this._bindings = {
                user: [],
                control: {}
            };
        },
        destroy: function () {
            if (this.element === null) {
                return;
            }
            var Class = this.constructor, pluginName = Class.pluginName || Class._fullName, controls;
            this.off();
            if (pluginName && pluginName !== 'can_control') {
                this.element.removeClass(pluginName);
            }
            controls = can.data(this.element, 'controls');
            controls.splice(can.inArray(this, controls), 1);
            can.trigger(this, 'destroyed');
            this.element = null;
        }
    });
var processors = can.Control.processors;
basicProcessor = function (el, event, selector, methodName, control) {
    return binder(el, event, can.Control._shifter(control, methodName), selector);
};
each([
    'change',
    'click',
    'contextmenu',
    'dblclick',
    'keydown',
    'keyup',
    'keypress',
    'mousedown',
    'mousemove',
    'mouseout',
    'mouseover',
    'mouseup',
    'reset',
    'resize',
    'scroll',
    'select',
    'submit',
    'focusin',
    'focusout',
    'mouseenter',
    'mouseleave',
    'touchstart',
    'touchmove',
    'touchcancel',
    'touchend',
    'touchleave',
    'inserted',
    'removed'
], function (v) {
    processors[v] = basicProcessor;
});
module.exports = Control;

},{"../construct/construct.js":4,"../util/util.js":23}],6:[function(require,module,exports){
/*control/route/route*/
var can = require('../../util/util.js');
require('../../route/route.js');
require('../control.js');
can.Control.processors.route = function (el, event, selector, funcName, controller) {
    selector = selector || '';
    if (!can.route.routes[selector]) {
        if (selector[0] === '/') {
            selector = selector.substring(1);
        }
        can.route(selector);
    }
    var batchNum, check = function (ev, attr, how) {
            if (can.route.attr('route') === selector && (ev.batchNum === undefined || ev.batchNum !== batchNum)) {
                batchNum = ev.batchNum;
                var d = can.route.attr();
                delete d.route;
                if (can.isFunction(controller[funcName])) {
                    controller[funcName](d);
                } else {
                    controller[controller[funcName]](d);
                }
            }
        };
    can.route.bind('change', check);
    return function () {
        can.route.unbind('change', check);
    };
};
module.exports = can;

},{"../../route/route.js":13,"../../util/util.js":23,"../control.js":5}],7:[function(require,module,exports){
/*event/event*/
var can = require('../util/can.js');
can.addEvent = function (event, handler) {
    var allEvents = this.__bindEvents || (this.__bindEvents = {}), eventList = allEvents[event] || (allEvents[event] = []);
    eventList.push({
        handler: handler,
        name: event
    });
    return this;
};
can.listenTo = function (other, event, handler) {
    var idedEvents = this.__listenToEvents;
    if (!idedEvents) {
        idedEvents = this.__listenToEvents = {};
    }
    var otherId = can.cid(other);
    var othersEvents = idedEvents[otherId];
    if (!othersEvents) {
        othersEvents = idedEvents[otherId] = {
            obj: other,
            events: {}
        };
    }
    var eventsEvents = othersEvents.events[event];
    if (!eventsEvents) {
        eventsEvents = othersEvents.events[event] = [];
    }
    eventsEvents.push(handler);
    can.bind.call(other, event, handler);
};
can.stopListening = function (other, event, handler) {
    var idedEvents = this.__listenToEvents, iterIdedEvents = idedEvents, i = 0;
    if (!idedEvents) {
        return this;
    }
    if (other) {
        var othercid = can.cid(other);
        (iterIdedEvents = {})[othercid] = idedEvents[othercid];
        if (!idedEvents[othercid]) {
            return this;
        }
    }
    for (var cid in iterIdedEvents) {
        var othersEvents = iterIdedEvents[cid], eventsEvents;
        other = idedEvents[cid].obj;
        if (!event) {
            eventsEvents = othersEvents.events;
        } else {
            (eventsEvents = {})[event] = othersEvents.events[event];
        }
        for (var eventName in eventsEvents) {
            var handlers = eventsEvents[eventName] || [];
            i = 0;
            while (i < handlers.length) {
                if (handler && handler === handlers[i] || !handler) {
                    can.unbind.call(other, eventName, handlers[i]);
                    handlers.splice(i, 1);
                } else {
                    i++;
                }
            }
            if (!handlers.length) {
                delete othersEvents.events[eventName];
            }
        }
        if (can.isEmptyObject(othersEvents.events)) {
            delete idedEvents[cid];
        }
    }
    return this;
};
can.removeEvent = function (event, fn, __validate) {
    if (!this.__bindEvents) {
        return this;
    }
    var events = this.__bindEvents[event] || [], i = 0, ev, isFunction = typeof fn === 'function';
    while (i < events.length) {
        ev = events[i];
        if (__validate ? __validate(ev, event, fn) : isFunction && ev.handler === fn || !isFunction && (ev.cid === fn || !fn)) {
            events.splice(i, 1);
        } else {
            i++;
        }
    }
    return this;
};
can.dispatch = function (event, args) {
    var events = this.__bindEvents;
    if (!events) {
        return;
    }
    if (typeof event === 'string') {
        event = { type: event };
    }
    var eventName = event.type, handlers = (events[eventName] || []).slice(0), passed = [event];
    if (args) {
        passed.push.apply(passed, args);
    }
    for (var i = 0, len = handlers.length; i < len; i++) {
        handlers[i].handler.apply(this, passed);
    }
    return event;
};
can.one = function (event, handler) {
    var one = function () {
        can.unbind.call(this, event, one);
        return handler.apply(this, arguments);
    };
    can.bind.call(this, event, one);
    return this;
};
can.event = {
    on: function () {
        if (arguments.length === 0 && can.Control && this instanceof can.Control) {
            return can.Control.prototype.on.call(this);
        } else {
            return can.addEvent.apply(this, arguments);
        }
    },
    off: function () {
        if (arguments.length === 0 && can.Control && this instanceof can.Control) {
            return can.Control.prototype.off.call(this);
        } else {
            return can.removeEvent.apply(this, arguments);
        }
    },
    bind: can.addEvent,
    unbind: can.removeEvent,
    delegate: function (selector, event, handler) {
        return can.addEvent.call(this, event, handler);
    },
    undelegate: function (selector, event, handler) {
        return can.removeEvent.call(this, event, handler);
    },
    trigger: can.dispatch,
    one: can.one,
    addEvent: can.addEvent,
    removeEvent: can.removeEvent,
    listenTo: can.listenTo,
    stopListening: can.stopListening,
    dispatch: can.dispatch
};
module.exports = can.event;

},{"../util/can.js":18}],8:[function(require,module,exports){
/*list/list*/
var can = require('../util/util.js');
var Map = require('../map/map.js');
var bubble = require('../map/bubble.js');
var splice = [].splice, spliceRemovesProps = function () {
        var obj = {
                0: 'a',
                length: 1
            };
        splice.call(obj, 0, 1);
        return !obj[0];
    }();
var list = Map.extend({ Map: Map }, {
        setup: function (instances, options) {
            this.length = 0;
            can.cid(this, '.map');
            this._init = 1;
            this._computedBindings = {};
            this._setupComputes();
            instances = instances || [];
            var teardownMapping;
            if (can.isDeferred(instances)) {
                this.replace(instances);
            } else {
                teardownMapping = instances.length && can.Map.helpers.addToMap(instances, this);
                this.push.apply(this, can.makeArray(instances || []));
            }
            if (teardownMapping) {
                teardownMapping();
            }
            this.bind('change', can.proxy(this._changes, this));
            can.simpleExtend(this, options);
            delete this._init;
        },
        _triggerChange: function (attr, how, newVal, oldVal) {
            Map.prototype._triggerChange.apply(this, arguments);
            var index = +attr;
            if (!~('' + attr).indexOf('.') && !isNaN(index)) {
                if (how === 'add') {
                    can.batch.trigger(this, how, [
                        newVal,
                        index
                    ]);
                    can.batch.trigger(this, 'length', [this.length]);
                } else if (how === 'remove') {
                    can.batch.trigger(this, how, [
                        oldVal,
                        index
                    ]);
                    can.batch.trigger(this, 'length', [this.length]);
                } else {
                    can.batch.trigger(this, how, [
                        newVal,
                        index
                    ]);
                }
            }
        },
        __get: function (attr) {
            if (attr) {
                if (this[attr] && this[attr].isComputed && can.isFunction(this.constructor.prototype[attr])) {
                    return this[attr]();
                } else {
                    return this[attr];
                }
            } else {
                return this;
            }
        },
        __set: function (prop, value, current) {
            prop = isNaN(+prop) || prop % 1 ? prop : +prop;
            if (typeof prop === 'number' && prop > this.length - 1) {
                var newArr = new Array(prop + 1 - this.length);
                newArr[newArr.length - 1] = value;
                value = newArr;
                prop = this.length;
            }
            return can.Map.prototype.__set.call(this, '' + prop, value, current);
        },
        ___set: function (attr, val) {
            this[attr] = val;
            if (+attr >= this.length) {
                this.length = +attr + 1;
            }
        },
        _remove: function (prop, current) {
            if (isNaN(+prop)) {
                delete this[prop];
                this._triggerChange(prop, 'remove', undefined, current);
            } else {
                this.splice(prop, 1);
            }
        },
        _each: function (callback) {
            var data = this.__get();
            for (var i = 0; i < data.length; i++) {
                callback(data[i], i);
            }
        },
        serialize: function () {
            return Map.helpers.serialize(this, 'serialize', []);
        },
        splice: function (index, howMany) {
            var args = can.makeArray(arguments), added = [], i, len, listIndex, allSame = args.length > 2;
            index = index || 0;
            for (i = 0, len = args.length - 2; i < len; i++) {
                listIndex = i + 2;
                args[listIndex] = this.__type(args[listIndex], listIndex);
                added.push(args[listIndex]);
                if (this[i + index] !== args[listIndex]) {
                    allSame = false;
                }
            }
            if (allSame) {
                return added;
            }
            if (howMany === undefined) {
                howMany = args[1] = this.length - index;
            }
            var removed = splice.apply(this, args);
            if (!spliceRemovesProps) {
                for (i = this.length; i < removed.length + this.length; i++) {
                    delete this[i];
                }
            }
            can.batch.start();
            if (howMany > 0) {
                bubble.removeMany(this, removed);
                this._triggerChange('' + index, 'remove', undefined, removed);
            }
            if (args.length > 2) {
                for (i = 0, len = added.length; i < len; i++) {
                    bubble.set(this, i, added[i]);
                }
                this._triggerChange('' + index, 'add', added, removed);
            }
            can.batch.stop();
            return removed;
        },
        _attrs: function (items, remove) {
            if (items === undefined) {
                return Map.helpers.serialize(this, 'attr', []);
            }
            items = can.makeArray(items);
            can.batch.start();
            this._updateAttrs(items, remove);
            can.batch.stop();
        },
        _updateAttrs: function (items, remove) {
            var len = Math.min(items.length, this.length);
            for (var prop = 0; prop < len; prop++) {
                var curVal = this[prop], newVal = items[prop];
                if (Map.helpers.isObservable(curVal) && Map.helpers.canMakeObserve(newVal)) {
                    curVal.attr(newVal, remove);
                } else if (curVal !== newVal) {
                    this._set(prop, newVal);
                } else {
                }
            }
            if (items.length > this.length) {
                this.push.apply(this, items.slice(this.length));
            } else if (items.length < this.length && remove) {
                this.splice(items.length);
            }
        }
    }), getArgs = function (args) {
        return args[0] && can.isArray(args[0]) ? args[0] : can.makeArray(args);
    };
can.each({
    push: 'length',
    unshift: 0
}, function (where, name) {
    var orig = [][name];
    list.prototype[name] = function () {
        var args = [], len = where ? this.length : 0, i = arguments.length, res, val;
        while (i--) {
            val = arguments[i];
            args[i] = bubble.set(this, i, this.__type(val, i));
        }
        res = orig.apply(this, args);
        if (!this.comparator || args.length) {
            this._triggerChange('' + len, 'add', args, undefined);
        }
        return res;
    };
});
can.each({
    pop: 'length',
    shift: 0
}, function (where, name) {
    list.prototype[name] = function () {
        if (!this.length) {
            return undefined;
        }
        var args = getArgs(arguments), len = where && this.length ? this.length - 1 : 0;
        var res = [][name].apply(this, args);
        this._triggerChange('' + len, 'remove', undefined, [res]);
        if (res && res.unbind) {
            bubble.remove(this, res);
        }
        return res;
    };
});
can.extend(list.prototype, {
    indexOf: function (item, fromIndex) {
        this.attr('length');
        return can.inArray(item, this, fromIndex);
    },
    join: function () {
        return [].join.apply(this.attr(), arguments);
    },
    reverse: function () {
        var list = [].reverse.call(can.makeArray(this));
        this.replace(list);
    },
    slice: function () {
        var temp = Array.prototype.slice.apply(this, arguments);
        return new this.constructor(temp);
    },
    concat: function () {
        var args = [];
        can.each(can.makeArray(arguments), function (arg, i) {
            args[i] = arg instanceof can.List ? arg.serialize() : arg;
        });
        return new this.constructor(Array.prototype.concat.apply(this.serialize(), args));
    },
    forEach: function (cb, thisarg) {
        return can.each(this, cb, thisarg || this);
    },
    replace: function (newList) {
        if (can.isDeferred(newList)) {
            newList.then(can.proxy(this.replace, this));
        } else {
            this.splice.apply(this, [
                0,
                this.length
            ].concat(can.makeArray(newList || [])));
        }
        return this;
    },
    filter: function (callback, thisArg) {
        var filteredList = new can.List(), self = this, filtered;
        this.each(function (item, index, list) {
            filtered = callback.call(thisArg | self, item, index, self);
            if (filtered) {
                filteredList.push(item);
            }
        });
        return filteredList;
    }
});
can.List = Map.List = list;
module.exports = can.List;

},{"../map/bubble.js":9,"../map/map.js":10,"../util/util.js":23}],9:[function(require,module,exports){
/*map/bubble*/
var can = require('../util/util.js');
var bubble = can.bubble = {
        event: function (map, eventName) {
            return map.constructor._bubbleRule(eventName, map);
        },
        childrenOf: function (parentMap, eventName) {
            parentMap._each(function (child, prop) {
                if (child && child.bind) {
                    bubble.toParent(child, parentMap, prop, eventName);
                }
            });
        },
        teardownChildrenFrom: function (parentMap, eventName) {
            parentMap._each(function (child) {
                bubble.teardownFromParent(parentMap, child, eventName);
            });
        },
        toParent: function (child, parent, prop, eventName) {
            can.listenTo.call(parent, child, eventName, function () {
                var args = can.makeArray(arguments), ev = args.shift();
                args[0] = (can.List && parent instanceof can.List ? parent.indexOf(child) : prop) + (args[0] ? '.' + args[0] : '');
                ev.triggeredNS = ev.triggeredNS || {};
                if (ev.triggeredNS[parent._cid]) {
                    return;
                }
                ev.triggeredNS[parent._cid] = true;
                can.trigger(parent, ev, args);
            });
        },
        teardownFromParent: function (parent, child, eventName) {
            if (child && child.unbind) {
                can.stopListening.call(parent, child, eventName);
            }
        },
        isBubbling: function (parent, eventName) {
            return parent._bubbleBindings && parent._bubbleBindings[eventName];
        },
        bind: function (parent, eventName) {
            if (!parent._init) {
                var bubbleEvent = bubble.event(parent, eventName);
                if (bubbleEvent) {
                    if (!parent._bubbleBindings) {
                        parent._bubbleBindings = {};
                    }
                    if (!parent._bubbleBindings[bubbleEvent]) {
                        parent._bubbleBindings[bubbleEvent] = 1;
                        bubble.childrenOf(parent, bubbleEvent);
                    } else {
                        parent._bubbleBindings[bubbleEvent]++;
                    }
                }
            }
        },
        unbind: function (parent, eventName) {
            var bubbleEvent = bubble.event(parent, eventName);
            if (bubbleEvent) {
                if (parent._bubbleBindings) {
                    parent._bubbleBindings[bubbleEvent]--;
                }
                if (parent._bubbleBindings && !parent._bubbleBindings[bubbleEvent]) {
                    delete parent._bubbleBindings[bubbleEvent];
                    bubble.teardownChildrenFrom(parent, bubbleEvent);
                    if (can.isEmptyObject(parent._bubbleBindings)) {
                        delete parent._bubbleBindings;
                    }
                }
            }
        },
        add: function (parent, child, prop) {
            if (child instanceof can.Map && parent._bubbleBindings) {
                for (var eventName in parent._bubbleBindings) {
                    if (parent._bubbleBindings[eventName]) {
                        bubble.teardownFromParent(parent, child, eventName);
                        bubble.toParent(child, parent, prop, eventName);
                    }
                }
            }
        },
        removeMany: function (parent, children) {
            for (var i = 0, len = children.length; i < len; i++) {
                bubble.remove(parent, children[i]);
            }
        },
        remove: function (parent, child) {
            if (child instanceof can.Map && parent._bubbleBindings) {
                for (var eventName in parent._bubbleBindings) {
                    if (parent._bubbleBindings[eventName]) {
                        bubble.teardownFromParent(parent, child, eventName);
                    }
                }
            }
        },
        set: function (parent, prop, value, current) {
            if (can.Map.helpers.isObservable(value)) {
                bubble.add(parent, value, prop);
            }
            if (can.Map.helpers.isObservable(current)) {
                bubble.remove(parent, current);
            }
            return value;
        }
    };
module.exports = bubble;

},{"../util/util.js":23}],10:[function(require,module,exports){
/*map/map*/
var can = require('../util/util.js');
var bind = require('../util/bind/bind.js');
var bubble = require('./bubble.js');
require('../construct/construct.js');
require('../util/batch/batch.js');
var madeMap = null;
var teardownMap = function () {
    for (var cid in madeMap) {
        if (madeMap[cid].added) {
            delete madeMap[cid].obj._cid;
        }
    }
    madeMap = null;
};
var getMapFromObject = function (obj) {
    return madeMap && madeMap[obj._cid] && madeMap[obj._cid].instance;
};
var serializeMap = null;
var Map = can.Map = can.Construct.extend({
        setup: function () {
            can.Construct.setup.apply(this, arguments);
            if (can.Map) {
                if (!this.defaults) {
                    this.defaults = {};
                }
                this._computes = [];
                for (var prop in this.prototype) {
                    if (prop !== 'define' && prop !== 'constructor' && (typeof this.prototype[prop] !== 'function' || this.prototype[prop].prototype instanceof can.Construct)) {
                        this.defaults[prop] = this.prototype[prop];
                    } else if (this.prototype[prop].isComputed) {
                        this._computes.push(prop);
                    }
                }
                if (this.helpers.define) {
                    this.helpers.define(this);
                }
            }
            if (can.List && !(this.prototype instanceof can.List)) {
                this.List = Map.List.extend({ Map: this }, {});
            }
        },
        _bubble: bubble,
        _bubbleRule: function (eventName) {
            return (eventName === 'change' || eventName.indexOf('.') >= 0) && 'change';
        },
        _computes: [],
        bind: can.bindAndSetup,
        on: can.bindAndSetup,
        unbind: can.unbindAndTeardown,
        off: can.unbindAndTeardown,
        id: 'id',
        helpers: {
            define: null,
            attrParts: function (attr, keepKey) {
                if (keepKey) {
                    return [attr];
                }
                return typeof attr === 'object' ? attr : ('' + attr).split('.');
            },
            addToMap: function (obj, instance) {
                var teardown;
                if (!madeMap) {
                    teardown = teardownMap;
                    madeMap = {};
                }
                var hasCid = obj._cid;
                var cid = can.cid(obj);
                if (!madeMap[cid]) {
                    madeMap[cid] = {
                        obj: obj,
                        instance: instance,
                        added: !hasCid
                    };
                }
                return teardown;
            },
            isObservable: function (obj) {
                return obj instanceof can.Map || obj && obj === can.route;
            },
            canMakeObserve: function (obj) {
                return obj && !can.isDeferred(obj) && (can.isArray(obj) || can.isPlainObject(obj));
            },
            serialize: function (map, how, where) {
                var cid = can.cid(map), firstSerialize = false;
                if (!serializeMap) {
                    firstSerialize = true;
                    serializeMap = {
                        attr: {},
                        serialize: {}
                    };
                }
                serializeMap[how][cid] = where;
                map.each(function (val, name) {
                    var result, isObservable = Map.helpers.isObservable(val), serialized = isObservable && serializeMap[how][can.cid(val)];
                    if (serialized) {
                        result = serialized;
                    } else {
                        if (how === 'serialize') {
                            result = Map.helpers._serialize(map, name, val);
                        } else {
                            result = Map.helpers._getValue(map, name, val, how);
                        }
                    }
                    if (result !== undefined) {
                        where[name] = result;
                    }
                });
                can.__reading(map, '__keys');
                if (firstSerialize) {
                    serializeMap = null;
                }
                return where;
            },
            _serialize: function (map, name, val) {
                return Map.helpers._getValue(map, name, val, 'serialize');
            },
            _getValue: function (map, name, val, how) {
                if (Map.helpers.isObservable(val)) {
                    return val[how]();
                } else {
                    return val;
                }
            }
        },
        keys: function (map) {
            var keys = [];
            can.__reading(map, '__keys');
            for (var keyName in map._data) {
                keys.push(keyName);
            }
            return keys;
        }
    }, {
        setup: function (obj) {
            if (obj instanceof can.Map) {
                obj = obj.serialize();
            }
            this._data = {};
            can.cid(this, '.map');
            this._init = 1;
            this._computedBindings = {};
            var defaultValues = this._setupDefaults(obj);
            this._setupComputes(defaultValues);
            var teardownMapping = obj && can.Map.helpers.addToMap(obj, this);
            var data = can.extend(can.extend(true, {}, defaultValues), obj);
            this.attr(data);
            if (teardownMapping) {
                teardownMapping();
            }
            this.bind('change', can.proxy(this._changes, this));
            delete this._init;
        },
        _setupComputes: function () {
            var computes = this.constructor._computes;
            for (var i = 0, len = computes.length, prop; i < len; i++) {
                prop = computes[i];
                this[prop] = this[prop].clone(this);
                this._computedBindings[prop] = { count: 0 };
            }
        },
        _setupDefaults: function () {
            return this.constructor.defaults || {};
        },
        _bindsetup: function () {
        },
        _bindteardown: function () {
        },
        _changes: function (ev, attr, how, newVal, oldVal) {
            can.batch.trigger(this, {
                type: attr,
                batchNum: ev.batchNum,
                target: ev.target
            }, [
                newVal,
                oldVal
            ]);
        },
        _triggerChange: function (attr, how, newVal, oldVal) {
            if (bubble.isBubbling(this, 'change')) {
                can.batch.trigger(this, {
                    type: 'change',
                    target: this
                }, [
                    attr,
                    how,
                    newVal,
                    oldVal
                ]);
            } else {
                can.batch.trigger(this, attr, [
                    newVal,
                    oldVal
                ]);
            }
            if (how === 'remove' || how === 'add') {
                can.batch.trigger(this, {
                    type: '__keys',
                    target: this
                });
            }
        },
        _each: function (callback) {
            var data = this.__get();
            for (var prop in data) {
                if (data.hasOwnProperty(prop)) {
                    callback(data[prop], prop);
                }
            }
        },
        attr: function (attr, val) {
            var type = typeof attr;
            if (type !== 'string' && type !== 'number') {
                return this._attrs(attr, val);
            } else if (arguments.length === 1) {
                can.__reading(this, attr);
                return this._get(attr);
            } else {
                this._set(attr, val);
                return this;
            }
        },
        each: function () {
            return can.each.apply(undefined, [this].concat(can.makeArray(arguments)));
        },
        removeAttr: function (attr) {
            var isList = can.List && this instanceof can.List, parts = can.Map.helpers.attrParts(attr), prop = parts.shift(), current = isList ? this[prop] : this._data[prop];
            if (parts.length && current) {
                return current.removeAttr(parts);
            } else {
                if (typeof attr === 'string' && !!~attr.indexOf('.')) {
                    prop = attr;
                }
                this._remove(prop, current);
                return current;
            }
        },
        _remove: function (prop, current) {
            if (prop in this._data) {
                delete this._data[prop];
                if (!(prop in this.constructor.prototype)) {
                    delete this[prop];
                }
                this._triggerChange(prop, 'remove', undefined, current);
            }
        },
        _get: function (attr) {
            attr = '' + attr;
            var dotIndex = attr.indexOf('.');
            if (dotIndex >= 0) {
                var value = this.__get(attr);
                if (value !== undefined) {
                    return value;
                }
                var first = attr.substr(0, dotIndex), second = attr.substr(dotIndex + 1), current = this.__get(first);
                return current && current._get ? current._get(second) : undefined;
            } else {
                return this.__get(attr);
            }
        },
        __get: function (attr) {
            if (attr) {
                if (this._computedBindings[attr]) {
                    return this[attr]();
                } else {
                    return this._data[attr];
                }
            } else {
                return this._data;
            }
        },
        __type: function (value, prop) {
            if (!(value instanceof can.Map) && can.Map.helpers.canMakeObserve(value)) {
                var cached = getMapFromObject(value);
                if (cached) {
                    return cached;
                }
                if (can.isArray(value)) {
                    var List = can.List;
                    return new List(value);
                } else {
                    var Map = this.constructor.Map || can.Map;
                    return new Map(value);
                }
            }
            return value;
        },
        _set: function (attr, value, keepKey) {
            attr = '' + attr;
            var dotIndex = attr.indexOf('.'), current;
            if (!keepKey && dotIndex >= 0) {
                var first = attr.substr(0, dotIndex), second = attr.substr(dotIndex + 1);
                current = this._init ? undefined : this.__get(first);
                if (Map.helpers.isObservable(current)) {
                    current._set(second, value);
                } else {
                    throw 'can.Map: Object does not exist';
                }
            } else {
                if (this.__convert) {
                    value = this.__convert(attr, value);
                }
                current = this._init ? undefined : this.__get(attr);
                this.__set(attr, this.__type(value, attr), current);
            }
        },
        __set: function (prop, value, current) {
            if (value !== current) {
                var changeType = current !== undefined || this.__get().hasOwnProperty(prop) ? 'set' : 'add';
                this.___set(prop, this.constructor._bubble.set(this, prop, value, current));
                this._triggerChange(prop, changeType, value, current);
                if (current) {
                    this.constructor._bubble.teardownFromParent(this, current);
                }
            }
        },
        ___set: function (prop, val) {
            if (this._computedBindings[prop]) {
                this[prop](val);
            } else {
                this._data[prop] = val;
            }
            if (typeof this.constructor.prototype[prop] !== 'function' && !this._computedBindings[prop]) {
                this[prop] = val;
            }
        },
        bind: function (eventName, handler) {
            var computedBinding = this._computedBindings && this._computedBindings[eventName];
            if (computedBinding) {
                if (!computedBinding.count) {
                    computedBinding.count = 1;
                    var self = this;
                    computedBinding.handler = function (ev, newVal, oldVal) {
                        can.batch.trigger(self, {
                            type: eventName,
                            batchNum: ev.batchNum,
                            target: self
                        }, [
                            newVal,
                            oldVal
                        ]);
                    };
                    this[eventName].bind('change', computedBinding.handler);
                } else {
                    computedBinding.count++;
                }
            }
            this.constructor._bubble.bind(this, eventName);
            return can.bindAndSetup.apply(this, arguments);
        },
        unbind: function (eventName, handler) {
            var computedBinding = this._computedBindings && this._computedBindings[eventName];
            if (computedBinding) {
                if (computedBinding.count === 1) {
                    computedBinding.count = 0;
                    this[eventName].unbind('change', computedBinding.handler);
                    delete computedBinding.handler;
                } else {
                    computedBinding.count--;
                }
            }
            this.constructor._bubble.unbind(this, eventName);
            return can.unbindAndTeardown.apply(this, arguments);
        },
        serialize: function () {
            return can.Map.helpers.serialize(this, 'serialize', {});
        },
        _attrs: function (props, remove) {
            if (props === undefined) {
                return Map.helpers.serialize(this, 'attr', {});
            }
            props = can.simpleExtend({}, props);
            var prop, self = this, newVal;
            can.batch.start();
            this.each(function (curVal, prop) {
                if (prop === '_cid') {
                    return;
                }
                newVal = props[prop];
                if (newVal === undefined) {
                    if (remove) {
                        self.removeAttr(prop);
                    }
                    return;
                }
                if (self.__convert) {
                    newVal = self.__convert(prop, newVal);
                }
                if (Map.helpers.isObservable(newVal)) {
                    self.__set(prop, self.__type(newVal, prop), curVal);
                } else if (Map.helpers.isObservable(curVal) && Map.helpers.canMakeObserve(newVal)) {
                    curVal.attr(newVal, remove);
                } else if (curVal !== newVal) {
                    self.__set(prop, self.__type(newVal, prop), curVal);
                }
                delete props[prop];
            });
            for (prop in props) {
                if (prop !== '_cid') {
                    newVal = props[prop];
                    this._set(prop, newVal, true);
                }
            }
            can.batch.stop();
            return this;
        },
        compute: function (prop) {
            if (can.isFunction(this.constructor.prototype[prop])) {
                return can.compute(this[prop], this);
            } else {
                var reads = prop.split('.'), last = reads.length - 1, options = { args: [] };
                return can.compute(function (newVal) {
                    if (arguments.length) {
                        can.compute.read(this, reads.slice(0, last)).value.attr(reads[last], newVal);
                    } else {
                        return can.compute.read(this, reads, options).value;
                    }
                }, this);
            }
        }
    });
Map.prototype.on = Map.prototype.bind;
Map.prototype.off = Map.prototype.unbind;
module.exports = Map;

},{"../construct/construct.js":4,"../util/batch/batch.js":16,"../util/bind/bind.js":17,"../util/util.js":23,"./bubble.js":9}],11:[function(require,module,exports){
/*model/model*/
var can = require('../util/util.js');
require('../map/map.js');
require('../list/list.js');
var pipe = function (def, thisArg, func) {
        var d = new can.Deferred();
        def.then(function () {
            var args = can.makeArray(arguments), success = true;
            try {
                args[0] = func.apply(thisArg, args);
            } catch (e) {
                success = false;
                d.rejectWith(d, [e].concat(args));
            }
            if (success) {
                d.resolveWith(d, args);
            }
        }, function () {
            d.rejectWith(this, arguments);
        });
        if (typeof def.abort === 'function') {
            d.abort = function () {
                return def.abort();
            };
        }
        return d;
    }, modelNum = 0, getId = function (inst) {
        can.__reading(inst, inst.constructor.id);
        return inst.__get(inst.constructor.id);
    }, ajax = function (ajaxOb, data, type, dataType, success, error) {
        var params = {};
        if (typeof ajaxOb === 'string') {
            var parts = ajaxOb.split(/\s+/);
            params.url = parts.pop();
            if (parts.length) {
                params.type = parts.pop();
            }
        } else {
            can.extend(params, ajaxOb);
        }
        params.data = typeof data === 'object' && !can.isArray(data) ? can.extend(params.data || {}, data) : data;
        params.url = can.sub(params.url, params.data, true);
        return can.ajax(can.extend({
            type: type || 'post',
            dataType: dataType || 'json',
            success: success,
            error: error
        }, params));
    }, makeRequest = function (modelObj, type, success, error, method) {
        var args;
        if (can.isArray(modelObj)) {
            args = modelObj[1];
            modelObj = modelObj[0];
        } else {
            args = modelObj.serialize();
        }
        args = [args];
        var deferred, model = modelObj.constructor, jqXHR;
        if (type === 'update' || type === 'destroy') {
            args.unshift(getId(modelObj));
        }
        jqXHR = model[type].apply(model, args);
        deferred = pipe(jqXHR, modelObj, function (data) {
            modelObj[method || type + 'd'](data, jqXHR);
            return modelObj;
        });
        if (jqXHR.abort) {
            deferred.abort = function () {
                jqXHR.abort();
            };
        }
        deferred.then(success, error);
        return deferred;
    }, converters = {
        models: function (instancesRawData, oldList, xhr) {
            can.Model._reqs++;
            if (!instancesRawData) {
                return;
            }
            if (instancesRawData instanceof this.List) {
                return instancesRawData;
            }
            var self = this, tmp = [], ListClass = self.List || ML, modelList = oldList instanceof can.List ? oldList : new ListClass(), rawDataIsList = instancesRawData instanceof ML, raw = rawDataIsList ? instancesRawData.serialize() : instancesRawData;
            raw = self.parseModels(raw, xhr);
            if (raw.data) {
                instancesRawData = raw;
                raw = raw.data;
            }
            if (typeof raw === 'undefined') {
                throw new Error('Could not get any raw data while converting using .models');
            }
            if (modelList.length) {
                modelList.splice(0);
            }
            can.each(raw, function (rawPart) {
                tmp.push(self.model(rawPart, xhr));
            });
            modelList.push.apply(modelList, tmp);
            if (!can.isArray(instancesRawData)) {
                can.each(instancesRawData, function (val, prop) {
                    if (prop !== 'data') {
                        modelList.attr(prop, val);
                    }
                });
            }
            setTimeout(can.proxy(this._clean, this), 1);
            return modelList;
        },
        model: function (attributes, oldModel, xhr) {
            if (!attributes) {
                return;
            }
            if (typeof attributes.serialize === 'function') {
                attributes = attributes.serialize();
            } else {
                attributes = this.parseModel(attributes, xhr);
            }
            var id = attributes[this.id];
            if ((id || id === 0) && this.store[id]) {
                oldModel = this.store[id];
            }
            var model = oldModel && can.isFunction(oldModel.attr) ? oldModel.attr(attributes, this.removeAttr || false) : new this(attributes);
            return model;
        }
    }, makeParser = {
        parseModel: function (prop) {
            return function (attributes) {
                return prop ? can.getObject(prop, attributes) : attributes;
            };
        },
        parseModels: function (prop) {
            return function (attributes) {
                if (can.isArray(attributes)) {
                    return attributes;
                }
                prop = prop || 'data';
                var result = can.getObject(prop, attributes);
                if (!can.isArray(result)) {
                    throw new Error('Could not get any raw data while converting using .models');
                }
                return result;
            };
        }
    }, ajaxMethods = {
        create: {
            url: '_shortName',
            type: 'post'
        },
        update: {
            data: function (id, attrs) {
                attrs = attrs || {};
                var identity = this.id;
                if (attrs[identity] && attrs[identity] !== id) {
                    attrs['new' + can.capitalize(id)] = attrs[identity];
                    delete attrs[identity];
                }
                attrs[identity] = id;
                return attrs;
            },
            type: 'put'
        },
        destroy: {
            type: 'delete',
            data: function (id, attrs) {
                attrs = attrs || {};
                attrs.id = attrs[this.id] = id;
                return attrs;
            }
        },
        findAll: { url: '_shortName' },
        findOne: {}
    }, ajaxMaker = function (ajaxMethod, str) {
        return function (data) {
            data = ajaxMethod.data ? ajaxMethod.data.apply(this, arguments) : data;
            return ajax(str || this[ajaxMethod.url || '_url'], data, ajaxMethod.type || 'get');
        };
    }, createURLFromResource = function (model, name) {
        if (!model.resource) {
            return;
        }
        var resource = model.resource.replace(/\/+$/, '');
        if (name === 'findAll' || name === 'create') {
            return resource;
        } else {
            return resource + '/{' + model.id + '}';
        }
    };
can.Model = can.Map.extend({
    fullName: 'can.Model',
    _reqs: 0,
    setup: function (base, fullName, staticProps, protoProps) {
        if (typeof fullName !== 'string') {
            protoProps = staticProps;
            staticProps = fullName;
        }
        if (!protoProps) {
            protoProps = staticProps;
        }
        this.store = {};
        can.Map.setup.apply(this, arguments);
        if (!can.Model) {
            return;
        }
        if (staticProps && staticProps.List) {
            this.List = staticProps.List;
            this.List.Map = this;
        } else {
            this.List = base.List.extend({ Map: this }, {});
        }
        var self = this, clean = can.proxy(this._clean, self);
        can.each(ajaxMethods, function (method, name) {
            if (staticProps && staticProps[name] && (typeof staticProps[name] === 'string' || typeof staticProps[name] === 'object')) {
                self[name] = ajaxMaker(method, staticProps[name]);
            } else if (staticProps && staticProps.resource && !can.isFunction(staticProps[name])) {
                self[name] = ajaxMaker(method, createURLFromResource(self, name));
            }
            if (self['make' + can.capitalize(name)]) {
                var newMethod = self['make' + can.capitalize(name)](self[name]);
                can.Construct._overwrite(self, base, name, function () {
                    can.Model._reqs++;
                    var def = newMethod.apply(this, arguments);
                    var then = def.then(clean, clean);
                    then.abort = def.abort;
                    return then;
                });
            }
        });
        var hasCustomConverter = {};
        can.each(converters, function (converter, name) {
            var parseName = 'parse' + can.capitalize(name), dataProperty = staticProps && staticProps[name] || self[name];
            if (typeof dataProperty === 'string') {
                self[parseName] = dataProperty;
                can.Construct._overwrite(self, base, name, converter);
            } else if (staticProps && staticProps[name]) {
                hasCustomConverter[parseName] = true;
            }
        });
        can.each(makeParser, function (maker, parseName) {
            var prop = staticProps && staticProps[parseName] || self[parseName];
            if (typeof prop === 'string') {
                can.Construct._overwrite(self, base, parseName, maker(prop));
            } else if ((!staticProps || !can.isFunction(staticProps[parseName])) && !self[parseName]) {
                var madeParser = maker();
                madeParser.useModelConverter = hasCustomConverter[parseName];
                can.Construct._overwrite(self, base, parseName, madeParser);
            }
        });
        if (self.fullName === 'can.Model' || !self.fullName) {
            self.fullName = 'Model' + ++modelNum;
        }
        can.Model._reqs = 0;
        this._url = this._shortName + '/{' + this.id + '}';
    },
    _ajax: ajaxMaker,
    _makeRequest: makeRequest,
    _clean: function () {
        can.Model._reqs--;
        if (!can.Model._reqs) {
            for (var id in this.store) {
                if (!this.store[id]._bindings) {
                    delete this.store[id];
                }
            }
        }
        return arguments[0];
    },
    models: converters.models,
    model: converters.model
}, {
    setup: function (attrs) {
        var id = attrs && attrs[this.constructor.id];
        if (can.Model._reqs && id != null) {
            this.constructor.store[id] = this;
        }
        can.Map.prototype.setup.apply(this, arguments);
    },
    isNew: function () {
        var id = getId(this);
        return !(id || id === 0);
    },
    save: function (success, error) {
        return makeRequest(this, this.isNew() ? 'create' : 'update', success, error);
    },
    destroy: function (success, error) {
        if (this.isNew()) {
            var self = this;
            var def = can.Deferred();
            def.then(success, error);
            return def.done(function (data) {
                self.destroyed(data);
            }).resolve(self);
        }
        return makeRequest(this, 'destroy', success, error, 'destroyed');
    },
    _bindsetup: function () {
        var modelInstance = this.__get(this.constructor.id);
        if (modelInstance != null) {
            this.constructor.store[modelInstance] = this;
        }
        return can.Map.prototype._bindsetup.apply(this, arguments);
    },
    _bindteardown: function () {
        delete this.constructor.store[getId(this)];
        return can.Map.prototype._bindteardown.apply(this, arguments);
    },
    ___set: function (prop, val) {
        can.Map.prototype.___set.call(this, prop, val);
        if (prop === this.constructor.id && this._bindings) {
            this.constructor.store[getId(this)] = this;
        }
    }
});
var makeGetterHandler = function (name) {
        return function (data, readyState, xhr) {
            return this[name](data, null, xhr);
        };
    }, createUpdateDestroyHandler = function (data) {
        if (this.parseModel.useModelConverter) {
            return this.model(data);
        }
        return this.parseModel(data);
    };
var responseHandlers = {
        makeFindAll: makeGetterHandler('models'),
        makeFindOne: makeGetterHandler('model'),
        makeCreate: createUpdateDestroyHandler,
        makeUpdate: createUpdateDestroyHandler
    };
can.each(responseHandlers, function (method, name) {
    can.Model[name] = function (oldMethod) {
        return function () {
            var args = can.makeArray(arguments), oldArgs = can.isFunction(args[1]) ? args.splice(0, 1) : args.splice(0, 2), def = pipe(oldMethod.apply(this, oldArgs), this, method);
            def.then(args[0], args[1]);
            return def;
        };
    };
});
can.each([
    'created',
    'updated',
    'destroyed'
], function (funcName) {
    can.Model.prototype[funcName] = function (attrs) {
        var self = this, constructor = self.constructor;
        if (attrs && typeof attrs === 'object') {
            this.attr(can.isFunction(attrs.attr) ? attrs.attr() : attrs);
        }
        can.dispatch.call(this, {
            type: 'change',
            target: this
        }, [funcName]);
        can.dispatch.call(constructor, funcName, [this]);
    };
});
var ML = can.Model.List = can.List.extend({
        _bubbleRule: function (eventName, list) {
            return can.List._bubbleRule(eventName, list) || 'destroyed';
        }
    }, {
        setup: function (params) {
            if (can.isPlainObject(params) && !can.isArray(params)) {
                can.List.prototype.setup.apply(this);
                this.replace(can.isDeferred(params) ? params : this.constructor.Map.findAll(params));
            } else {
                can.List.prototype.setup.apply(this, arguments);
            }
            this._init = 1;
            this.bind('destroyed', can.proxy(this._destroyed, this));
            delete this._init;
        },
        _destroyed: function (ev, attr) {
            if (/\w+/.test(attr)) {
                var index;
                while ((index = this.indexOf(ev.target)) > -1) {
                    this.splice(index, 1);
                }
            }
        }
    });
module.exports = can.Model;

},{"../list/list.js":8,"../map/map.js":10,"../util/util.js":23}],12:[function(require,module,exports){
/*observe/observe*/
var can = require('../util/util.js');
require('../map/map.js');
require('../list/list.js');
require('../compute/compute.js');
can.Observe = can.Map;
can.Observe.startBatch = can.batch.start;
can.Observe.stopBatch = can.batch.stop;
can.Observe.triggerBatch = can.batch.trigger;
module.exports = can;

},{"../compute/compute.js":3,"../list/list.js":8,"../map/map.js":10,"../util/util.js":23}],13:[function(require,module,exports){
/*route/route*/
var can = require('../util/util.js');
require('../map/map.js');
require('../list/list.js');
require('../util/string/deparam/deparam.js');
var matcher = /\:([\w\.]+)/g, paramsMatcher = /^(?:&[^=]+=[^&]*)+/, makeProps = function (props) {
        var tags = [];
        can.each(props, function (val, name) {
            tags.push((name === 'className' ? 'class' : name) + '="' + (name === 'href' ? val : can.esc(val)) + '"');
        });
        return tags.join(' ');
    }, matchesData = function (route, data) {
        var count = 0, i = 0, defaults = {};
        for (var name in route.defaults) {
            if (route.defaults[name] === data[name]) {
                defaults[name] = 1;
                count++;
            }
        }
        for (; i < route.names.length; i++) {
            if (!data.hasOwnProperty(route.names[i])) {
                return -1;
            }
            if (!defaults[route.names[i]]) {
                count++;
            }
        }
        return count;
    }, location = window.location, wrapQuote = function (str) {
        return (str + '').replace(/([.?*+\^$\[\]\\(){}|\-])/g, '\\$1');
    }, each = can.each, extend = can.extend, stringify = function (obj) {
        if (obj && typeof obj === 'object') {
            if (obj instanceof can.Map) {
                obj = obj.attr();
            } else {
                obj = can.isFunction(obj.slice) ? obj.slice() : can.extend({}, obj);
            }
            can.each(obj, function (val, prop) {
                obj[prop] = stringify(val);
            });
        } else if (obj !== undefined && obj !== null && can.isFunction(obj.toString)) {
            obj = obj.toString();
        }
        return obj;
    }, removeBackslash = function (str) {
        return str.replace(/\\/g, '');
    }, timer, curParams, lastHash, changingData, onRouteDataChange = function (ev, attr, how, newval) {
        changingData = 1;
        clearTimeout(timer);
        timer = setTimeout(function () {
            changingData = 0;
            var serialized = can.route.data.serialize(), path = can.route.param(serialized, true);
            can.route._call('setURL', path);
            can.batch.trigger(eventsObject, '__url', [
                path,
                lastHash
            ]);
            lastHash = path;
        }, 10);
    }, eventsObject = can.extend({}, can.event);
can.route = function (url, defaults) {
    var root = can.route._call('root');
    if (root.lastIndexOf('/') === root.length - 1 && url.indexOf('/') === 0) {
        url = url.substr(1);
    }
    defaults = defaults || {};
    var names = [], res, test = '', lastIndex = matcher.lastIndex = 0, next, querySeparator = can.route._call('querySeparator'), matchSlashes = can.route._call('matchSlashes');
    while (res = matcher.exec(url)) {
        names.push(res[1]);
        test += removeBackslash(url.substring(lastIndex, matcher.lastIndex - res[0].length));
        next = '\\' + (removeBackslash(url.substr(matcher.lastIndex, 1)) || querySeparator + (matchSlashes ? '' : '|/'));
        test += '([^' + next + ']' + (defaults[res[1]] ? '*' : '+') + ')';
        lastIndex = matcher.lastIndex;
    }
    test += url.substr(lastIndex).replace('\\', '');
    can.route.routes[url] = {
        test: new RegExp('^' + test + '($|' + wrapQuote(querySeparator) + ')'),
        route: url,
        names: names,
        defaults: defaults,
        length: url.split('/').length
    };
    return can.route;
};
extend(can.route, {
    param: function (data, _setRoute) {
        var route, matches = 0, matchCount, routeName = data.route, propCount = 0;
        delete data.route;
        each(data, function () {
            propCount++;
        });
        each(can.route.routes, function (temp, name) {
            matchCount = matchesData(temp, data);
            if (matchCount > matches) {
                route = temp;
                matches = matchCount;
            }
            if (matchCount >= propCount) {
                return false;
            }
        });
        if (can.route.routes[routeName] && matchesData(can.route.routes[routeName], data) === matches) {
            route = can.route.routes[routeName];
        }
        if (route) {
            var cpy = extend({}, data), res = route.route.replace(matcher, function (whole, name) {
                    delete cpy[name];
                    return data[name] === route.defaults[name] ? '' : encodeURIComponent(data[name]);
                }).replace('\\', ''), after;
            each(route.defaults, function (val, name) {
                if (cpy[name] === val) {
                    delete cpy[name];
                }
            });
            after = can.param(cpy);
            if (_setRoute) {
                can.route.attr('route', route.route);
            }
            return res + (after ? can.route._call('querySeparator') + after : '');
        }
        return can.isEmptyObject(data) ? '' : can.route._call('querySeparator') + can.param(data);
    },
    deparam: function (url) {
        var root = can.route._call('root');
        if (root.lastIndexOf('/') === root.length - 1 && url.indexOf('/') === 0) {
            url = url.substr(1);
        }
        var route = { length: -1 }, querySeparator = can.route._call('querySeparator'), paramsMatcher = can.route._call('paramsMatcher');
        each(can.route.routes, function (temp, name) {
            if (temp.test.test(url) && temp.length > route.length) {
                route = temp;
            }
        });
        if (route.length > -1) {
            var parts = url.match(route.test), start = parts.shift(), remainder = url.substr(start.length - (parts[parts.length - 1] === querySeparator ? 1 : 0)), obj = remainder && paramsMatcher.test(remainder) ? can.deparam(remainder.slice(1)) : {};
            obj = extend(true, {}, route.defaults, obj);
            each(parts, function (part, i) {
                if (part && part !== querySeparator) {
                    obj[route.names[i]] = decodeURIComponent(part);
                }
            });
            obj.route = route.route;
            return obj;
        }
        if (url.charAt(0) !== querySeparator) {
            url = querySeparator + url;
        }
        return paramsMatcher.test(url) ? can.deparam(url.slice(1)) : {};
    },
    data: new can.Map({}),
    map: function (data) {
        var appState;
        if (data.prototype instanceof can.Map) {
            appState = new data();
        } else {
            appState = data;
        }
        can.route.data = appState;
    },
    routes: {},
    ready: function (val) {
        if (val !== true) {
            can.route._setup();
            can.route.setState();
        }
        return can.route;
    },
    url: function (options, merge) {
        if (merge) {
            options = can.extend({}, can.route.deparam(can.route._call('matchingPartOfURL')), options);
        }
        return can.route._call('root') + can.route.param(options);
    },
    link: function (name, options, props, merge) {
        return '<a ' + makeProps(extend({ href: can.route.url(options, merge) }, props)) + '>' + name + '</a>';
    },
    current: function (options) {
        can.__reading(eventsObject, '__url');
        return this._call('matchingPartOfURL') === can.route.param(options);
    },
    bindings: {
        hashchange: {
            paramsMatcher: paramsMatcher,
            querySeparator: '&',
            matchSlashes: false,
            bind: function () {
                can.bind.call(window, 'hashchange', setState);
            },
            unbind: function () {
                can.unbind.call(window, 'hashchange', setState);
            },
            matchingPartOfURL: function () {
                return location.href.split(/#!?/)[1] || '';
            },
            setURL: function (path) {
                location.hash = '#!' + path;
                return path;
            },
            root: '#!'
        }
    },
    defaultBinding: 'hashchange',
    currentBinding: null,
    _setup: function () {
        if (!can.route.currentBinding) {
            can.route._call('bind');
            can.route.bind('change', onRouteDataChange);
            can.route.currentBinding = can.route.defaultBinding;
        }
    },
    _teardown: function () {
        if (can.route.currentBinding) {
            can.route._call('unbind');
            can.route.unbind('change', onRouteDataChange);
            can.route.currentBinding = null;
        }
        clearTimeout(timer);
        changingData = 0;
    },
    _call: function () {
        var args = can.makeArray(arguments), prop = args.shift(), binding = can.route.bindings[can.route.currentBinding || can.route.defaultBinding], method = binding[prop];
        if (method.apply) {
            return method.apply(binding, args);
        } else {
            return method;
        }
    }
});
each([
    'bind',
    'unbind',
    'on',
    'off',
    'delegate',
    'undelegate',
    'removeAttr',
    'compute',
    '_get',
    '__get',
    'each'
], function (name) {
    can.route[name] = function () {
        if (!can.route.data[name]) {
            return;
        }
        return can.route.data[name].apply(can.route.data, arguments);
    };
});
can.route.attr = function (attr, val) {
    var type = typeof attr, newArguments;
    if (val === undefined) {
        newArguments = arguments;
    } else if (type !== 'string' && type !== 'number') {
        newArguments = [
            stringify(attr),
            val
        ];
    } else {
        newArguments = [
            attr,
            stringify(val)
        ];
    }
    return can.route.data.attr.apply(can.route.data, newArguments);
};
var setState = can.route.setState = function () {
        var hash = can.route._call('matchingPartOfURL');
        var oldParams = curParams;
        curParams = can.route.deparam(hash);
        if (!changingData || hash !== lastHash) {
            can.batch.start();
            recursiveClean(oldParams, curParams, can.route.data);
            can.route.attr(curParams);
            can.batch.trigger(eventsObject, '__url', [
                hash,
                lastHash
            ]);
            can.batch.stop();
        }
    };
var recursiveClean = function (old, cur, data) {
    for (var attr in old) {
        if (cur[attr] === undefined) {
            data.removeAttr(attr);
        } else if (Object.prototype.toString.call(old[attr]) === '[object Object]') {
            recursiveClean(old[attr], cur[attr], data.attr(attr));
        }
    }
};
module.exports = can.route;

},{"../list/list.js":8,"../map/map.js":10,"../util/string/deparam/deparam.js":21,"../util/util.js":23}],14:[function(require,module,exports){
/*util/array/each*/
var can = require('../can.js');
var isArrayLike = function (obj) {
    var length = obj.length;
    return typeof arr !== 'function' && (length === 0 || typeof length === 'number' && length > 0 && length - 1 in obj);
};
can.each = function (elements, callback, context) {
    var i = 0, key, len, item;
    if (elements) {
        if (isArrayLike(elements)) {
            if (can.List && elements instanceof can.List) {
                for (len = elements.attr('length'); i < len; i++) {
                    item = elements.attr(i);
                    if (callback.call(context || item, item, i, elements) === false) {
                        break;
                    }
                }
            } else {
                for (len = elements.length; i < len; i++) {
                    item = elements[i];
                    if (callback.call(context || item, item, i, elements) === false) {
                        break;
                    }
                }
            }
        } else if (typeof elements === 'object') {
            if (can.Map && elements instanceof can.Map || elements === can.route) {
                var keys = can.Map.keys(elements);
                for (i = 0, len = keys.length; i < len; i++) {
                    key = keys[i];
                    item = elements.attr(key);
                    if (callback.call(context || item, item, key, elements) === false) {
                        break;
                    }
                }
            } else {
                for (key in elements) {
                    if (elements.hasOwnProperty(key) && callback.call(context || elements[key], elements[key], key, elements) === false) {
                        break;
                    }
                }
            }
        }
    }
    return elements;
};
module.exports = can;

},{"../can.js":18}],15:[function(require,module,exports){
/*util/attr/attr*/
var can = require('../can.js');
var setImmediate = can.global.setImmediate || function (cb) {
        return setTimeout(cb, 0);
    }, attr = {
        MutationObserver: can.global.MutationObserver || can.global.WebKitMutationObserver || can.global.MozMutationObserver,
        map: {
            'class': 'className',
            'value': 'value',
            'innertext': 'innerText',
            'textcontent': 'textContent',
            'checked': true,
            'disabled': true,
            'readonly': true,
            'required': true,
            src: function (el, val) {
                if (val == null || val === '') {
                    el.removeAttribute('src');
                    return null;
                } else {
                    el.setAttribute('src', val);
                    return val;
                }
            },
            style: function (el, val) {
                return el.style.cssText = val || '';
            }
        },
        defaultValue: [
            'input',
            'textarea'
        ],
        set: function (el, attrName, val) {
            attrName = attrName.toLowerCase();
            var oldValue;
            if (!attr.MutationObserver) {
                oldValue = attr.get(el, attrName);
            }
            var tagName = el.nodeName.toString().toLowerCase(), prop = attr.map[attrName], newValue;
            if (typeof prop === 'function') {
                newValue = prop(el, val);
            } else if (prop === true) {
                newValue = el[attrName] = true;
                if (attrName === 'checked' && el.type === 'radio') {
                    if (can.inArray(tagName, attr.defaultValue) >= 0) {
                        el.defaultChecked = true;
                    }
                }
            } else if (prop) {
                newValue = el[prop] = val;
                if (prop === 'value' && can.inArray(tagName, attr.defaultValue) >= 0) {
                    el.defaultValue = val;
                }
            } else {
                el.setAttribute(attrName, val);
                newValue = val;
            }
            if (!attr.MutationObserver && newValue !== oldValue) {
                attr.trigger(el, attrName, oldValue);
            }
        },
        trigger: function (el, attrName, oldValue) {
            if (can.data(can.$(el), 'canHasAttributesBindings')) {
                attrName = attrName.toLowerCase();
                return setImmediate(function () {
                    can.trigger(el, {
                        type: 'attributes',
                        attributeName: attrName,
                        target: el,
                        oldValue: oldValue,
                        bubbles: false
                    }, []);
                });
            }
        },
        get: function (el, attrName) {
            attrName = attrName.toLowerCase();
            var prop = attr.map[attrName];
            if (typeof prop === 'string' && el[prop]) {
                return el[prop];
            }
            return el.getAttribute(attrName);
        },
        remove: function (el, attrName) {
            attrName = attrName.toLowerCase();
            var oldValue;
            if (!attr.MutationObserver) {
                oldValue = attr.get(el, attrName);
            }
            var setter = attr.map[attrName];
            if (typeof setter === 'function') {
                setter(el, undefined);
            }
            if (setter === true) {
                el[attrName] = false;
            } else if (typeof setter === 'string') {
                el[setter] = '';
            } else {
                el.removeAttribute(attrName);
            }
            if (!attr.MutationObserver && oldValue != null) {
                attr.trigger(el, attrName, oldValue);
            }
        },
        has: function () {
            var el = can.global.document && document.createElement('div');
            if (el && el.hasAttribute) {
                return function (el, name) {
                    return el.hasAttribute(name);
                };
            } else {
                return function (el, name) {
                    return el.getAttribute(name) !== null;
                };
            }
        }()
    };
module.exports = attr;

},{"../can.js":18}],16:[function(require,module,exports){
/*util/batch/batch*/
var can = require('../can.js');
var batchNum = 1, transactions = 0, batchEvents = [], stopCallbacks = [];
can.batch = {
    start: function (batchStopHandler) {
        transactions++;
        if (batchStopHandler) {
            stopCallbacks.push(batchStopHandler);
        }
    },
    stop: function (force, callStart) {
        if (force) {
            transactions = 0;
        } else {
            transactions--;
        }
        if (transactions === 0) {
            var items = batchEvents.slice(0), callbacks = stopCallbacks.slice(0), i, len;
            batchEvents = [];
            stopCallbacks = [];
            batchNum++;
            if (callStart) {
                can.batch.start();
            }
            for (i = 0, len = items.length; i < len; i++) {
                can.dispatch.apply(items[i][0], items[i][1]);
            }
            for (i = 0, len = callbacks.length; i < callbacks.length; i++) {
                callbacks[i]();
            }
        }
    },
    trigger: function (item, event, args) {
        if (!item._init) {
            if (transactions === 0) {
                return can.dispatch.call(item, event, args);
            } else {
                event = typeof event === 'string' ? { type: event } : event;
                event.batchNum = batchNum;
                batchEvents.push([
                    item,
                    [
                        event,
                        args
                    ]
                ]);
            }
        }
    }
};

},{"../can.js":18}],17:[function(require,module,exports){
/*util/bind/bind*/
var can = require('../util.js');
can.bindAndSetup = function () {
    can.addEvent.apply(this, arguments);
    if (!this._init) {
        if (!this._bindings) {
            this._bindings = 1;
            if (this._bindsetup) {
                this._bindsetup();
            }
        } else {
            this._bindings++;
        }
    }
    return this;
};
can.unbindAndTeardown = function (ev, handler) {
    can.removeEvent.apply(this, arguments);
    if (this._bindings === null) {
        this._bindings = 0;
    } else {
        this._bindings--;
    }
    if (!this._bindings && this._bindteardown) {
        this._bindteardown();
    }
    return this;
};
module.exports = can;

},{"../util.js":23}],18:[function(require,module,exports){
(function (global){
/*util/can*/
var glbl = typeof window !== 'undefined' ? window : global;
var can = {};
if (typeof GLOBALCAN === 'undefined' || GLOBALCAN !== false) {
    glbl.can = can;
}
can.global = glbl;
can.k = function () {
};
can.isDeferred = function (obj) {
    return obj && typeof obj.then === 'function' && typeof obj.pipe === 'function';
};
var cid = 0;
can.cid = function (object, name) {
    if (!object._cid) {
        cid++;
        object._cid = (name || '') + cid;
    }
    return object._cid;
};
can.VERSION = '2.2.0-alpha.10';
can.simpleExtend = function (d, s) {
    for (var prop in s) {
        d[prop] = s[prop];
    }
    return d;
};
can.frag = function (item) {
    var frag;
    if (!item || typeof item === 'string') {
        frag = can.buildFragment(item == null ? '' : '' + item, document.body);
        if (!frag.childNodes.length) {
            frag.appendChild(document.createTextNode(''));
        }
        return frag;
    } else if (item.nodeType === 11) {
        return item;
    } else if (typeof item.nodeType === 'number') {
        frag = document.createDocumentFragment();
        frag.appendChild(item);
        return frag;
    } else if (typeof item.length === 'number') {
        frag = document.createDocumentFragment();
        can.each(item, function (item) {
            frag.appendChild(can.frag(item));
        });
        return frag;
    } else {
        frag = can.buildFragment('' + item, document.body);
        if (!frag.childNodes.length) {
            frag.appendChild(document.createTextNode(''));
        }
        return frag;
    }
};
can.scope = function (el, attr) {
    el = can.$(el);
    var scope = can.data(el, 'scope');
    if (!scope) {
        scope = can.Map ? new can.Map() : {};
        can.data(el, 'scope', scope);
    }
    if (attr) {
        return scope.attr(attr);
    } else {
        return scope;
    }
};
can['import'] = function (moduleName) {
    var deferred = new can.Deferred();
    if (typeof window.System === 'object') {
        window.System['import'](moduleName).then(can.proxy(deferred.resolve, deferred), can.proxy(deferred.reject, deferred));
    } else if (window.require && window.require.amd) {
        window.require([moduleName], function (value) {
            deferred.resolve(value);
        });
    } else if (window.steal) {
        steal.steal(moduleName, function (value) {
            deferred.resolve(value);
        });
    } else if (window.require) {
        deferred.resolve(window.require(moduleName));
    } else {
        deferred.resolve();
    }
    return deferred.promise();
};
can.__reading = function () {
};
module.exports = can;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],19:[function(require,module,exports){
/*util/inserted/inserted*/
var can = require('../can.js');
can.inserted = function (elems) {
    elems = can.makeArray(elems);
    var inDocument = false, doc = can.$(document.contains ? document : document.body), children;
    for (var i = 0, elem; (elem = elems[i]) !== undefined; i++) {
        if (!inDocument) {
            if (elem.getElementsByTagName) {
                if (can.has(doc, elem).length) {
                    inDocument = true;
                } else {
                    return;
                }
            } else {
                continue;
            }
        }
        if (inDocument && elem.getElementsByTagName) {
            children = can.makeArray(elem.getElementsByTagName('*'));
            can.trigger(elem, 'inserted', [], false);
            for (var j = 0, child; (child = children[j]) !== undefined; j++) {
                can.trigger(child, 'inserted', [], false);
            }
        }
    }
};
can.appendChild = function (el, child) {
    var children;
    if (child.nodeType === 11) {
        children = can.makeArray(child.childNodes);
    } else {
        children = [child];
    }
    el.appendChild(child);
    can.inserted(children);
};
can.insertBefore = function (el, child, ref) {
    var children;
    if (child.nodeType === 11) {
        children = can.makeArray(child.childNodes);
    } else {
        children = [child];
    }
    el.insertBefore(child, ref);
    can.inserted(children);
};

},{"../can.js":18}],20:[function(require,module,exports){
/*util/jquery/jquery*/
var $ = require('jquery');
var can = require('../can.js');
var attr = require('../attr/attr.js');
var event = require('../../event/event.js');
require('../array/each.js');
require('../inserted/inserted.js');
var isBindableElement = function (node) {
    return node.nodeName && (node.nodeType === 1 || node.nodeType === 9) || node == window;
};
$ = $ || window.$;
$.extend(can, $, {
    trigger: function (obj, event, args, bubbles) {
        if (isBindableElement(obj)) {
            $.event.trigger(event, args, obj, !bubbles);
        } else if (obj.trigger) {
            obj.trigger(event, args);
        } else {
            if (typeof event === 'string') {
                event = { type: event };
            }
            event.target = event.target || obj;
            if (args) {
                if (args.length && typeof args === 'string') {
                    args = [args];
                } else if (!args.length) {
                    args = [args];
                }
            }
            if (!args) {
                args = [];
            }
            can.dispatch.call(obj, event, args);
        }
    },
    event: can.event,
    addEvent: can.addEvent,
    removeEvent: can.removeEvent,
    buildFragment: function (elems, context) {
        var ret;
        elems = [elems];
        context = context || document;
        context = !context.nodeType && context[0] || context;
        context = context.ownerDocument || context;
        ret = $.buildFragment(elems, context);
        return ret.cacheable ? $.clone(ret.fragment) : ret.fragment || ret;
    },
    $: $,
    each: can.each,
    bind: function (ev, cb) {
        if (this.bind && this.bind !== can.bind) {
            this.bind(ev, cb);
        } else if (isBindableElement(this)) {
            $.event.add(this, ev, cb);
        } else {
            can.addEvent.call(this, ev, cb);
        }
        return this;
    },
    unbind: function (ev, cb) {
        if (this.unbind && this.unbind !== can.unbind) {
            this.unbind(ev, cb);
        } else if (isBindableElement(this)) {
            $.event.remove(this, ev, cb);
        } else {
            can.removeEvent.call(this, ev, cb);
        }
        return this;
    },
    delegate: function (selector, ev, cb) {
        if (this.delegate) {
            this.delegate(selector, ev, cb);
        } else if (isBindableElement(this)) {
            $(this).delegate(selector, ev, cb);
        } else {
            can.bind.call(this, ev, cb);
        }
        return this;
    },
    undelegate: function (selector, ev, cb) {
        if (this.undelegate) {
            this.undelegate(selector, ev, cb);
        } else if (isBindableElement(this)) {
            $(this).undelegate(selector, ev, cb);
        } else {
            can.unbind.call(this, ev, cb);
        }
        return this;
    },
    proxy: function (fn, context) {
        return function () {
            return fn.apply(context, arguments);
        };
    },
    attr: attr
});
can.on = can.bind;
can.off = can.unbind;
$.each([
    'append',
    'filter',
    'addClass',
    'remove',
    'data',
    'get',
    'has'
], function (i, name) {
    can[name] = function (wrapped) {
        return wrapped[name].apply(wrapped, can.makeArray(arguments).slice(1));
    };
});
var oldClean = $.cleanData;
$.cleanData = function (elems) {
    $.each(elems, function (i, elem) {
        if (elem) {
            can.trigger(elem, 'removed', [], false);
        }
    });
    oldClean(elems);
};
var oldDomManip = $.fn.domManip, cbIndex;
$.fn.domManip = function (args, cb1, cb2) {
    for (var i = 1; i < arguments.length; i++) {
        if (typeof arguments[i] === 'function') {
            cbIndex = i;
            break;
        }
    }
    return oldDomManip.apply(this, arguments);
};
$(document.createElement('div')).append(document.createElement('div'));
$.fn.domManip = cbIndex === 2 ? function (args, table, callback) {
    return oldDomManip.call(this, args, table, function (elem) {
        var elems;
        if (elem.nodeType === 11) {
            elems = can.makeArray(elem.childNodes);
        }
        var ret = callback.apply(this, arguments);
        can.inserted(elems ? elems : [elem]);
        return ret;
    });
} : function (args, callback) {
    return oldDomManip.call(this, args, function (elem) {
        var elems;
        if (elem.nodeType === 11) {
            elems = can.makeArray(elem.childNodes);
        }
        var ret = callback.apply(this, arguments);
        can.inserted(elems ? elems : [elem]);
        return ret;
    });
};
if (!can.attr.MutationObserver) {
    var oldAttr = $.attr;
    $.attr = function (el, attrName) {
        var oldValue, newValue;
        if (arguments.length >= 3) {
            oldValue = oldAttr.call(this, el, attrName);
        }
        var res = oldAttr.apply(this, arguments);
        if (arguments.length >= 3) {
            newValue = oldAttr.call(this, el, attrName);
        }
        if (newValue !== oldValue) {
            can.attr.trigger(el, attrName, oldValue);
        }
        return res;
    };
    var oldRemove = $.removeAttr;
    $.removeAttr = function (el, attrName) {
        var oldValue = oldAttr.call(this, el, attrName), res = oldRemove.apply(this, arguments);
        if (oldValue != null) {
            can.attr.trigger(el, attrName, oldValue);
        }
        return res;
    };
    $.event.special.attributes = {
        setup: function () {
            can.data(can.$(this), 'canHasAttributesBindings', true);
        },
        teardown: function () {
            $.removeData(this, 'canHasAttributesBindings');
        }
    };
} else {
    $.event.special.attributes = {
        setup: function () {
            var self = this;
            var observer = new can.attr.MutationObserver(function (mutations) {
                    mutations.forEach(function (mutation) {
                        var copy = can.simpleExtend({}, mutation);
                        can.trigger(self, copy, []);
                    });
                });
            observer.observe(this, {
                attributes: true,
                attributeOldValue: true
            });
            can.data(can.$(this), 'canAttributesObserver', observer);
        },
        teardown: function () {
            can.data(can.$(this), 'canAttributesObserver').disconnect();
            $.removeData(this, 'canAttributesObserver');
        }
    };
}
(function () {
    var text = '<-\n>', frag = can.buildFragment(text, document);
    if (text !== frag.childNodes[0].nodeValue) {
        var oldBuildFragment = can.buildFragment;
        can.buildFragment = function (content, context) {
            var res = oldBuildFragment(content, context);
            if (res.childNodes.length === 1 && res.childNodes[0].nodeType === 3) {
                res.childNodes[0].nodeValue = content;
            }
            return res;
        };
    }
}());
$.event.special.inserted = {};
$.event.special.removed = {};
module.exports = can;

},{"../../event/event.js":7,"../array/each.js":14,"../attr/attr.js":15,"../can.js":18,"../inserted/inserted.js":19,"jquery":35}],21:[function(require,module,exports){
/*util/string/deparam/deparam*/
var can = require('../../util.js');
require('../string.js');
var digitTest = /^\d+$/, keyBreaker = /([^\[\]]+)|(\[\])/g, paramTest = /([^?#]*)(#.*)?$/, prep = function (str) {
        return decodeURIComponent(str.replace(/\+/g, ' '));
    };
can.extend(can, {
    deparam: function (params) {
        var data = {}, pairs, lastPart;
        if (params && paramTest.test(params)) {
            pairs = params.split('&');
            can.each(pairs, function (pair) {
                var parts = pair.split('='), key = prep(parts.shift()), value = prep(parts.join('=')), current = data;
                if (key) {
                    parts = key.match(keyBreaker);
                    for (var j = 0, l = parts.length - 1; j < l; j++) {
                        if (!current[parts[j]]) {
                            current[parts[j]] = digitTest.test(parts[j + 1]) || parts[j + 1] === '[]' ? [] : {};
                        }
                        current = current[parts[j]];
                    }
                    lastPart = parts.pop();
                    if (lastPart === '[]') {
                        current.push(value);
                    } else {
                        current[lastPart] = value;
                    }
                }
            });
        }
        return data;
    }
});
module.exports = can;

},{"../../util.js":23,"../string.js":22}],22:[function(require,module,exports){
/*util/string/string*/
var can = require('../util.js');
var strUndHash = /_|-/, strColons = /\=\=/, strWords = /([A-Z]+)([A-Z][a-z])/g, strLowUp = /([a-z\d])([A-Z])/g, strDash = /([a-z\d])([A-Z])/g, strReplacer = /\{([^\}]+)\}/g, strQuote = /"/g, strSingleQuote = /'/g, strHyphenMatch = /-+(.)?/g, strCamelMatch = /[a-z][A-Z]/g, getNext = function (obj, prop, add) {
        var result = obj[prop];
        if (result === undefined && add === true) {
            result = obj[prop] = {};
        }
        return result;
    }, isContainer = function (current) {
        return /^f|^o/.test(typeof current);
    }, convertBadValues = function (content) {
        var isInvalid = content === null || content === undefined || isNaN(content) && '' + content === 'NaN';
        return '' + (isInvalid ? '' : content);
    };
can.extend(can, {
    esc: function (content) {
        return convertBadValues(content).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(strQuote, '&#34;').replace(strSingleQuote, '&#39;');
    },
    getObject: function (name, roots, add) {
        var parts = name ? name.split('.') : [], length = parts.length, current, r = 0, i, container, rootsLength;
        roots = can.isArray(roots) ? roots : [roots || window];
        rootsLength = roots.length;
        if (!length) {
            return roots[0];
        }
        for (r; r < rootsLength; r++) {
            current = roots[r];
            container = undefined;
            for (i = 0; i < length && isContainer(current); i++) {
                container = current;
                current = getNext(container, parts[i]);
            }
            if (container !== undefined && current !== undefined) {
                break;
            }
        }
        if (add === false && current !== undefined) {
            delete container[parts[i - 1]];
        }
        if (add === true && current === undefined) {
            current = roots[0];
            for (i = 0; i < length && isContainer(current); i++) {
                current = getNext(current, parts[i], true);
            }
        }
        return current;
    },
    capitalize: function (s, cache) {
        return s.charAt(0).toUpperCase() + s.slice(1);
    },
    camelize: function (str) {
        return convertBadValues(str).replace(strHyphenMatch, function (match, chr) {
            return chr ? chr.toUpperCase() : '';
        });
    },
    hyphenate: function (str) {
        return convertBadValues(str).replace(strCamelMatch, function (str, offset) {
            return str.charAt(0) + '-' + str.charAt(1).toLowerCase();
        });
    },
    underscore: function (s) {
        return s.replace(strColons, '/').replace(strWords, '$1_$2').replace(strLowUp, '$1_$2').replace(strDash, '_').toLowerCase();
    },
    sub: function (str, data, remove) {
        var obs = [];
        str = str || '';
        obs.push(str.replace(strReplacer, function (whole, inside) {
            var ob = can.getObject(inside, data, remove === true ? false : undefined);
            if (ob === undefined || ob === null) {
                obs = null;
                return '';
            }
            if (isContainer(ob) && obs) {
                obs.push(ob);
                return '';
            }
            return '' + ob;
        }));
        return obs === null ? obs : obs.length <= 1 ? obs[0] : obs;
    },
    replacer: strReplacer,
    undHash: strUndHash
});
module.exports = can;

},{"../util.js":23}],23:[function(require,module,exports){
/*util/util*/
var can = require('./jquery/jquery.js');
module.exports = can;

},{"./jquery/jquery.js":20}],24:[function(require,module,exports){
/*view/bindings/bindings*/
var can = require('../../util/util.js');
require('../callbacks/callbacks.js');
require('../../control/control.js');
var isContentEditable = function () {
        var values = {
                '': true,
                'true': true,
                'false': false
            };
        var editable = function (el) {
            if (!el || !el.getAttribute) {
                return;
            }
            var attr = el.getAttribute('contenteditable');
            return values[attr];
        };
        return function (el) {
            var val = editable(el);
            if (typeof val === 'boolean') {
                return val;
            } else {
                return !!editable(el.parentNode);
            }
        };
    }(), removeCurly = function (value) {
        if (value[0] === '{' && value[value.length - 1] === '}') {
            return value.substr(1, value.length - 2);
        }
        return value;
    };
can.view.attr('can-value', function (el, data) {
    var attr = removeCurly(el.getAttribute('can-value')), value = data.scope.computeData(attr, { args: [] }).compute, trueValue, falseValue;
    if (el.nodeName.toLowerCase() === 'input') {
        if (el.type === 'checkbox') {
            if (can.attr.has(el, 'can-true-value')) {
                trueValue = el.getAttribute('can-true-value');
            } else {
                trueValue = true;
            }
            if (can.attr.has(el, 'can-false-value')) {
                falseValue = el.getAttribute('can-false-value');
            } else {
                falseValue = false;
            }
        }
        if (el.type === 'checkbox' || el.type === 'radio') {
            new Checked(el, {
                value: value,
                trueValue: trueValue,
                falseValue: falseValue
            });
            return;
        }
    }
    if (el.nodeName.toLowerCase() === 'select' && el.multiple) {
        new Multiselect(el, { value: value });
        return;
    }
    if (isContentEditable(el)) {
        new Content(el, { value: value });
        return;
    }
    new Value(el, { value: value });
});
var special = {
        enter: function (data, el, original) {
            return {
                event: 'keyup',
                handler: function (ev) {
                    if (ev.keyCode === 13) {
                        return original.call(this, ev);
                    }
                }
            };
        }
    };
can.view.attr(/can-[\w\.]+/, function (el, data) {
    var attributeName = data.attributeName, event = attributeName.substr('can-'.length), handler = function (ev) {
            var attrVal = el.getAttribute(attributeName);
            if (!attrVal) {
                return false;
            }
            var attr = removeCurly(attrVal), scopeData = data.scope.read(attr, {
                    returnObserveMethods: true,
                    isArgument: true
                });
            return scopeData.value.call(scopeData.parent, data.scope._context, can.$(this), ev);
        };
    if (special[event]) {
        var specialData = special[event](data, el, handler);
        handler = specialData.handler;
        event = specialData.event;
    }
    can.bind.call(el, event, handler);
});
var Value = can.Control.extend({
        init: function () {
            if (this.element[0].nodeName.toUpperCase() === 'SELECT') {
                setTimeout(can.proxy(this.set, this), 1);
            } else {
                this.set();
            }
        },
        '{value} change': 'set',
        set: function () {
            if (!this.element) {
                return;
            }
            var val = this.options.value();
            this.element[0].value = val == null ? '' : val;
        },
        'change': function () {
            if (!this.element) {
                return;
            }
            var el = this.element[0];
            this.options.value(el.value);
            var newVal = this.options.value();
            if (el.value !== newVal) {
                el.value = newVal;
            }
        }
    }), Checked = can.Control.extend({
        init: function () {
            this.isCheckbox = this.element[0].type.toLowerCase() === 'checkbox';
            this.check();
        },
        '{value} change': 'check',
        check: function () {
            if (this.isCheckbox) {
                var value = this.options.value(), trueValue = this.options.trueValue || true;
                this.element[0].checked = value === trueValue;
            } else {
                var setOrRemove = this.options.value() == this.element[0].value ? 'set' : 'remove';
                can.attr[setOrRemove](this.element[0], 'checked', true);
            }
        },
        'change': function () {
            if (this.isCheckbox) {
                this.options.value(this.element[0].checked ? this.options.trueValue : this.options.falseValue);
            } else {
                if (this.element[0].checked) {
                    this.options.value(this.element[0].value);
                }
            }
        }
    }), Multiselect = Value.extend({
        init: function () {
            this.delimiter = ';';
            setTimeout(can.proxy(this.set, this), 1);
        },
        set: function () {
            var newVal = this.options.value();
            if (typeof newVal === 'string') {
                newVal = newVal.split(this.delimiter);
                this.isString = true;
            } else if (newVal) {
                newVal = can.makeArray(newVal);
            }
            var isSelected = {};
            can.each(newVal, function (val) {
                isSelected[val] = true;
            });
            can.each(this.element[0].childNodes, function (option) {
                if (option.value) {
                    option.selected = !!isSelected[option.value];
                }
            });
        },
        get: function () {
            var values = [], children = this.element[0].childNodes;
            can.each(children, function (child) {
                if (child.selected && child.value) {
                    values.push(child.value);
                }
            });
            return values;
        },
        'change': function () {
            var value = this.get(), currentValue = this.options.value();
            if (this.isString || typeof currentValue === 'string') {
                this.isString = true;
                this.options.value(value.join(this.delimiter));
            } else if (currentValue instanceof can.List) {
                currentValue.attr(value, true);
            } else {
                this.options.value(value);
            }
        }
    }), Content = can.Control.extend({
        init: function () {
            this.set();
            this.on('blur', 'setValue');
        },
        '{value} change': 'set',
        set: function () {
            var val = this.options.value();
            this.element[0].innerHTML = typeof val === 'undefined' ? '' : val;
        },
        setValue: function () {
            this.options.value(this.element[0].innerHTML);
        }
    });

},{"../../control/control.js":5,"../../util/util.js":23,"../callbacks/callbacks.js":25}],25:[function(require,module,exports){
/*view/callbacks/callbacks*/
var can = require('../../util/util.js');
require('../view.js');
var attr = can.view.attr = function (attributeName, attrHandler) {
        if (attrHandler) {
            if (typeof attributeName === 'string') {
                attributes[attributeName] = attrHandler;
            } else {
                regExpAttributes.push({
                    match: attributeName,
                    handler: attrHandler
                });
            }
        } else {
            var cb = attributes[attributeName];
            if (!cb) {
                for (var i = 0, len = regExpAttributes.length; i < len; i++) {
                    var attrMatcher = regExpAttributes[i];
                    if (attrMatcher.match.test(attributeName)) {
                        cb = attrMatcher.handler;
                        break;
                    }
                }
            }
            return cb;
        }
    };
var attributes = {}, regExpAttributes = [], automaticCustomElementCharacters = /[-\:]/;
var tag = can.view.tag = function (tagName, tagHandler) {
        if (tagHandler) {
            if (can.global.html5) {
                can.global.html5.elements += ' ' + tagName;
                can.global.html5.shivDocument();
            }
            tags[tagName.toLowerCase()] = tagHandler;
        } else {
            var cb = tags[tagName.toLowerCase()];
            if (!cb && automaticCustomElementCharacters.test(tagName)) {
                cb = function () {
                };
            }
            return cb;
        }
    };
var tags = {};
can.view.callbacks = {
    _tags: tags,
    _attributes: attributes,
    _regExpAttributes: regExpAttributes,
    tag: tag,
    attr: attr,
    tagHandler: function (el, tagName, tagData) {
        var helperTagCallback = tagData.options.attr('tags.' + tagName), tagCallback = helperTagCallback || tags[tagName];
        var scope = tagData.scope, res;
        if (tagCallback) {
            var reads = can.__clearReading();
            res = tagCallback(el, tagData);
            can.__setReading(reads);
        } else {
            res = scope;
        }
        if (res && tagData.subtemplate) {
            if (scope !== res) {
                scope = scope.add(res);
            }
            var result = tagData.subtemplate(scope, tagData.options);
            var frag = typeof result === 'string' ? can.view.frag(result) : result;
            can.appendChild(el, frag);
        }
    }
};
module.exports = can.view.callbacks;

},{"../../util/util.js":23,"../view.js":34}],26:[function(require,module,exports){
/*view/elements*/
var can = require('../util/util.js');
require('./view.js');
var doc = typeof document !== 'undefined' ? document : null;
var selectsCommentNodes = doc && function () {
        return can.$(document.createComment('~')).length === 1;
    }();
var elements = {
        tagToContentPropMap: {
            option: doc && 'textContent' in document.createElement('option') ? 'textContent' : 'innerText',
            textarea: 'value'
        },
        attrMap: can.attr.map,
        attrReg: /([^\s=]+)[\s]*=[\s]*/,
        defaultValue: can.attr.defaultValue,
        tagMap: {
            '': 'span',
            colgroup: 'col',
            table: 'tbody',
            tr: 'td',
            ol: 'li',
            ul: 'li',
            tbody: 'tr',
            thead: 'tr',
            tfoot: 'tr',
            select: 'option',
            optgroup: 'option'
        },
        reverseTagMap: {
            col: 'colgroup',
            tr: 'tbody',
            option: 'select',
            td: 'tr',
            th: 'tr',
            li: 'ul'
        },
        getParentNode: function (el, defaultParentNode) {
            return defaultParentNode && el.parentNode.nodeType === 11 ? defaultParentNode : el.parentNode;
        },
        setAttr: can.attr.set,
        getAttr: can.attr.get,
        removeAttr: can.attr.remove,
        contentText: function (text) {
            if (typeof text === 'string') {
                return text;
            }
            if (!text && text !== 0) {
                return '';
            }
            return '' + text;
        },
        after: function (oldElements, newFrag) {
            var last = oldElements[oldElements.length - 1];
            if (last.nextSibling) {
                can.insertBefore(last.parentNode, newFrag, last.nextSibling);
            } else {
                can.appendChild(last.parentNode, newFrag);
            }
        },
        replace: function (oldElements, newFrag) {
            elements.after(oldElements, newFrag);
            if (can.remove(can.$(oldElements)).length < oldElements.length && !selectsCommentNodes) {
                can.each(oldElements, function (el) {
                    if (el.nodeType === 8) {
                        el.parentNode.removeChild(el);
                    }
                });
            }
        }
    };
can.view.elements = elements;
module.exports = elements;

},{"../util/util.js":23,"./view.js":34}],27:[function(require,module,exports){
/*view/live/live*/
var can = require('../../util/util.js');
var elements = require('../elements.js');
var view = require('../view.js');
var nodeLists = require('../node_lists/node_lists.js');
var parser = require('../parser/parser.js');
elements = elements || can.view.elements;
nodeLists = nodeLists || can.view.NodeLists;
parser = parser || can.view.parser;
var setup = function (el, bind, unbind) {
        var tornDown = false, teardown = function () {
                if (!tornDown) {
                    tornDown = true;
                    unbind(data);
                    can.unbind.call(el, 'removed', teardown);
                }
                return true;
            }, data = {
                teardownCheck: function (parent) {
                    return parent ? false : teardown();
                }
            };
        can.bind.call(el, 'removed', teardown);
        bind(data);
        return data;
    }, listen = function (el, compute, change) {
        return setup(el, function () {
            compute.bind('change', change);
        }, function (data) {
            compute.unbind('change', change);
            if (data.nodeList) {
                nodeLists.unregister(data.nodeList);
            }
        });
    }, getAttributeParts = function (newVal) {
        var attrs = {}, attr;
        parser.parseAttrs(newVal, {
            attrStart: function (name) {
                attrs[name] = '';
                attr = name;
            },
            attrValue: function (value) {
                attrs[attr] += value;
            },
            attrEnd: function () {
            }
        });
        return attrs;
    }, splice = [].splice, isNode = function (obj) {
        return obj && obj.nodeType;
    }, addTextNodeIfNoChildren = function (frag) {
        if (!frag.childNodes.length) {
            frag.appendChild(document.createTextNode(''));
        }
    };
var live = {
        list: function (el, compute, render, context, parentNode, nodeList) {
            var masterNodeList = nodeList || [el], indexMap = [], add = function (ev, items, index) {
                    var frag = document.createDocumentFragment(), newNodeLists = [], newIndicies = [];
                    can.each(items, function (item, key) {
                        var itemNodeList = [];
                        if (nodeList) {
                            nodeLists.register(itemNodeList, null, true);
                        }
                        var itemIndex = can.compute(key + index), itemHTML = render.call(context, item, itemIndex, itemNodeList), gotText = typeof itemHTML === 'string', itemFrag = can.frag(itemHTML);
                        itemFrag = gotText ? can.view.hookup(itemFrag) : itemFrag;
                        var childNodes = can.makeArray(itemFrag.childNodes);
                        if (nodeList) {
                            nodeLists.update(itemNodeList, childNodes);
                            newNodeLists.push(itemNodeList);
                        } else {
                            newNodeLists.push(nodeLists.register(childNodes));
                        }
                        frag.appendChild(itemFrag);
                        newIndicies.push(itemIndex);
                    });
                    var masterListIndex = index + 1;
                    if (!masterNodeList[masterListIndex]) {
                        elements.after(masterListIndex === 1 ? [text] : [nodeLists.last(masterNodeList[masterListIndex - 1])], frag);
                    } else {
                        var el = nodeLists.first(masterNodeList[masterListIndex]);
                        can.insertBefore(el.parentNode, frag, el);
                    }
                    splice.apply(masterNodeList, [
                        masterListIndex,
                        0
                    ].concat(newNodeLists));
                    splice.apply(indexMap, [
                        index,
                        0
                    ].concat(newIndicies));
                    for (var i = index + newIndicies.length, len = indexMap.length; i < len; i++) {
                        indexMap[i](i);
                    }
                }, remove = function (ev, items, index, duringTeardown, fullTeardown) {
                    if (!duringTeardown && data.teardownCheck(text.parentNode)) {
                        return;
                    }
                    if (index < 0) {
                        index = indexMap.length + index;
                    }
                    var removedMappings = masterNodeList.splice(index + 1, items.length), itemsToRemove = [];
                    can.each(removedMappings, function (nodeList) {
                        var nodesToRemove = nodeLists.unregister(nodeList);
                        [].push.apply(itemsToRemove, nodesToRemove);
                    });
                    indexMap.splice(index, items.length);
                    for (var i = index, len = indexMap.length; i < len; i++) {
                        indexMap[i](i);
                    }
                    if (!fullTeardown) {
                        can.remove(can.$(itemsToRemove));
                    }
                }, move = function (ev, item, newIndex, currentIndex) {
                    newIndex = newIndex + 1;
                    currentIndex = currentIndex + 1;
                    var referenceItem = masterNodeList[newIndex][0];
                    var movedItem = masterNodeList[currentIndex][0];
                    var parentNode = referenceItem.parentNode;
                    if (currentIndex < newIndex) {
                        referenceItem = referenceItem.nextSibling;
                    }
                    parentNode.insertBefore(movedItem, referenceItem);
                    var temp = masterNodeList[currentIndex];
                    [].splice.apply(masterNodeList, [
                        currentIndex,
                        1
                    ]);
                    [].splice.apply(masterNodeList, [
                        newIndex,
                        0,
                        temp
                    ]);
                }, text = document.createTextNode(''), list, teardownList = function (fullTeardown) {
                    if (list && list.unbind) {
                        list.unbind('add', add).unbind('remove', remove);
                    }
                    remove({}, { length: masterNodeList.length - 1 }, 0, true, fullTeardown);
                }, updateList = function (ev, newList, oldList) {
                    teardownList();
                    list = newList || [];
                    if (list.bind) {
                        list.bind('add', add).bind('remove', remove).bind('move', move);
                    }
                    add({}, list, 0);
                };
            parentNode = elements.getParentNode(el, parentNode);
            var data = setup(parentNode, function () {
                    if (can.isFunction(compute)) {
                        compute.bind('change', updateList);
                    }
                }, function () {
                    if (can.isFunction(compute)) {
                        compute.unbind('change', updateList);
                    }
                    teardownList(true);
                });
            if (!nodeList) {
                live.replace(masterNodeList, text, data.teardownCheck);
            } else {
                elements.replace(masterNodeList, text);
                nodeLists.update(masterNodeList, [text]);
                nodeList.unregistered = data.teardownCheck;
            }
            updateList({}, can.isFunction(compute) ? compute() : compute);
        },
        html: function (el, compute, parentNode, nodeList) {
            var data;
            parentNode = elements.getParentNode(el, parentNode);
            data = listen(parentNode, compute, function (ev, newVal, oldVal) {
                var attached = nodeLists.first(nodes).parentNode;
                if (attached) {
                    makeAndPut(newVal);
                }
                data.teardownCheck(nodeLists.first(nodes).parentNode);
            });
            var nodes = nodeList || [el], makeAndPut = function (val) {
                    var isString = !isNode(val), frag = can.frag(val), oldNodes = can.makeArray(nodes);
                    addTextNodeIfNoChildren(frag);
                    if (isString) {
                        frag = can.view.hookup(frag, parentNode);
                    }
                    oldNodes = nodeLists.update(nodes, frag.childNodes);
                    elements.replace(oldNodes, frag);
                };
            data.nodeList = nodes;
            if (!nodeList) {
                nodeLists.register(nodes, data.teardownCheck);
            } else {
                nodeList.unregistered = data.teardownCheck;
            }
            makeAndPut(compute());
        },
        replace: function (nodes, val, teardown) {
            var oldNodes = nodes.slice(0), frag = can.frag(val);
            nodeLists.register(nodes, teardown);
            if (typeof val === 'string') {
                frag = can.view.hookup(frag, nodes[0].parentNode);
            }
            nodeLists.update(nodes, frag.childNodes);
            elements.replace(oldNodes, frag);
            return nodes;
        },
        text: function (el, compute, parentNode, nodeList) {
            var parent = elements.getParentNode(el, parentNode);
            var data = listen(parent, compute, function (ev, newVal, oldVal) {
                    if (typeof node.nodeValue !== 'unknown') {
                        node.nodeValue = can.view.toStr(newVal);
                    }
                    data.teardownCheck(node.parentNode);
                });
            var node = document.createTextNode(can.view.toStr(compute()));
            if (nodeList) {
                nodeList.unregistered = data.teardownCheck;
                data.nodeList = nodeList;
                nodeLists.update(nodeList, [node]);
                elements.replace([el], node);
            } else {
                data.nodeList = live.replace([el], node, data.teardownCheck);
            }
        },
        setAttributes: function (el, newVal) {
            var attrs = getAttributeParts(newVal);
            for (var name in attrs) {
                can.attr.set(el, name, attrs[name]);
            }
        },
        attributes: function (el, compute, currentValue) {
            var oldAttrs = {};
            var setAttrs = function (newVal) {
                var newAttrs = getAttributeParts(newVal), name;
                for (name in newAttrs) {
                    var newValue = newAttrs[name], oldValue = oldAttrs[name];
                    if (newValue !== oldValue) {
                        can.attr.set(el, name, newValue);
                    }
                    delete oldAttrs[name];
                }
                for (name in oldAttrs) {
                    elements.removeAttr(el, name);
                }
                oldAttrs = newAttrs;
            };
            listen(el, compute, function (ev, newVal) {
                setAttrs(newVal);
            });
            if (arguments.length >= 3) {
                oldAttrs = getAttributeParts(currentValue);
            } else {
                setAttrs(compute());
            }
        },
        attributePlaceholder: '__!!__',
        attributeReplace: /__!!__/g,
        attribute: function (el, attributeName, compute) {
            listen(el, compute, function (ev, newVal) {
                elements.setAttr(el, attributeName, hook.render());
            });
            var wrapped = can.$(el), hooks;
            hooks = can.data(wrapped, 'hooks');
            if (!hooks) {
                can.data(wrapped, 'hooks', hooks = {});
            }
            var attr = elements.getAttr(el, attributeName), parts = attr.split(live.attributePlaceholder), goodParts = [], hook;
            goodParts.push(parts.shift(), parts.join(live.attributePlaceholder));
            if (hooks[attributeName]) {
                hooks[attributeName].computes.push(compute);
            } else {
                hooks[attributeName] = {
                    render: function () {
                        var i = 0, newAttr = attr ? attr.replace(live.attributeReplace, function () {
                                return elements.contentText(hook.computes[i++]());
                            }) : elements.contentText(hook.computes[i++]());
                        return newAttr;
                    },
                    computes: [compute],
                    batchNum: undefined
                };
            }
            hook = hooks[attributeName];
            goodParts.splice(1, 0, compute());
            elements.setAttr(el, attributeName, goodParts.join(''));
        },
        specialAttribute: function (el, attributeName, compute) {
            listen(el, compute, function (ev, newVal) {
                elements.setAttr(el, attributeName, getValue(newVal));
            });
            elements.setAttr(el, attributeName, getValue(compute()));
        },
        simpleAttribute: function (el, attributeName, compute) {
            listen(el, compute, function (ev, newVal) {
                elements.setAttr(el, attributeName, newVal);
            });
            elements.setAttr(el, attributeName, compute());
        }
    };
live.attr = live.simpleAttribute;
live.attrs = live.attributes;
var newLine = /(\r|\n)+/g;
var getValue = function (val) {
    var regexp = /^["'].*["']$/;
    val = val.replace(elements.attrReg, '').replace(newLine, '');
    return regexp.test(val) ? val.substr(1, val.length - 2) : val;
};
can.view.live = live;
module.exports = live;

},{"../../util/util.js":23,"../elements.js":26,"../node_lists/node_lists.js":29,"../parser/parser.js":30,"../view.js":34}],28:[function(require,module,exports){
/*view/mustache/mustache*/
var can = require('../../util/util.js');
require('../scope/scope.js');
require('../view.js');
require('../scanner.js');
require('../../compute/compute.js');
require('../render.js');
require('../bindings/bindings.js');
can.view.ext = '.mustache';
var SCOPE = 'scope', HASH = '___h4sh', CONTEXT_OBJ = '{scope:' + SCOPE + ',options:options}', SPECIAL_CONTEXT_OBJ = '{scope:' + SCOPE + ',options:options, special: true}', ARG_NAMES = SCOPE + ',options', argumentsRegExp = /((([^'"\s]+?=)?('.*?'|".*?"))|.*?)\s/g, literalNumberStringBooleanRegExp = /^(('.*?'|".*?"|[0-9]+\.?[0-9]*|true|false|null|undefined)|((.+?)=(('.*?'|".*?"|[0-9]+\.?[0-9]*|true|false)|(.+))))$/, makeLookupLiteral = function (type) {
        return '{get:"' + type.replace(/"/g, '\\"') + '"}';
    }, isLookup = function (obj) {
        return obj && typeof obj.get === 'string';
    }, isObserveLike = function (obj) {
        return obj instanceof can.Map || obj && !!obj._get;
    }, isArrayLike = function (obj) {
        return obj && obj.splice && typeof obj.length === 'number';
    }, makeConvertToScopes = function (original, scope, options) {
        var originalWithScope = function (ctx, opts) {
            return original(ctx || scope, opts);
        };
        return function (updatedScope, updatedOptions) {
            if (updatedScope !== undefined && !(updatedScope instanceof can.view.Scope)) {
                updatedScope = scope.add(updatedScope);
            }
            if (updatedOptions !== undefined && !(updatedOptions instanceof can.view.Options)) {
                updatedOptions = options.add(updatedOptions);
            }
            return originalWithScope(updatedScope, updatedOptions || options);
        };
    };
var Mustache = function (options, helpers) {
    if (this.constructor !== Mustache) {
        var mustache = new Mustache(options);
        return function (data, options) {
            return mustache.render(data, options);
        };
    }
    if (typeof options === 'function') {
        this.template = { fn: options };
        return;
    }
    can.extend(this, options);
    this.template = this.scanner.scan(this.text, this.name);
};
can.Mustache = can.global.Mustache = Mustache;
Mustache.prototype.render = function (data, options) {
    if (!(data instanceof can.view.Scope)) {
        data = new can.view.Scope(data || {});
    }
    if (!(options instanceof can.view.Options)) {
        options = new can.view.Options(options || {});
    }
    options = options || {};
    return this.template.fn.call(data, data, options);
};
can.extend(Mustache.prototype, {
    scanner: new can.view.Scanner({
        text: {
            start: '',
            scope: SCOPE,
            options: ',options: options',
            argNames: ARG_NAMES
        },
        tokens: [
            [
                'returnLeft',
                '{{{',
                '{{[{&]'
            ],
            [
                'commentFull',
                '{{!}}',
                '^[\\s\\t]*{{!.+?}}\\n'
            ],
            [
                'commentLeft',
                '{{!',
                '(\\n[\\s\\t]*{{!|{{!)'
            ],
            [
                'escapeFull',
                '{{}}',
                '(^[\\s\\t]*{{[#/^][^}]+?}}\\n|\\n[\\s\\t]*{{[#/^][^}]+?}}\\n|\\n[\\s\\t]*{{[#/^][^}]+?}}$)',
                function (content) {
                    return {
                        before: /^\n.+?\n$/.test(content) ? '\n' : '',
                        content: content.match(/\{\{(.+?)\}\}/)[1] || ''
                    };
                }
            ],
            [
                'escapeLeft',
                '{{'
            ],
            [
                'returnRight',
                '}}}'
            ],
            [
                'right',
                '}}'
            ]
        ],
        helpers: [
            {
                name: /^>[\s]*\w*/,
                fn: function (content, cmd) {
                    var templateName = can.trim(content.replace(/^>\s?/, '')).replace(/["|']/g, '');
                    return 'can.Mustache.renderPartial(\'' + templateName + '\',' + ARG_NAMES + ')';
                }
            },
            {
                name: /^\s*data\s/,
                fn: function (content, cmd) {
                    var attr = content.match(/["|'](.*)["|']/)[1];
                    return 'can.proxy(function(__){' + 'can.data(can.$(__),\'' + attr + '\', this.attr(\'.\')); }, ' + SCOPE + ')';
                }
            },
            {
                name: /\s*\(([\$\w]+)\)\s*->([^\n]*)/,
                fn: function (content) {
                    var quickFunc = /\s*\(([\$\w]+)\)\s*->([^\n]*)/, parts = content.match(quickFunc);
                    return 'can.proxy(function(__){var ' + parts[1] + '=can.$(__);with(' + SCOPE + '.attr(\'.\')){' + parts[2] + '}}, this);';
                }
            },
            {
                name: /^.*$/,
                fn: function (content, cmd) {
                    var mode = false, result = {
                            content: '',
                            startTxt: false,
                            startOnlyTxt: false,
                            end: false
                        };
                    content = can.trim(content);
                    if (content.length && (mode = content.match(/^([#^/]|else$)/))) {
                        mode = mode[0];
                        switch (mode) {
                        case '#':
                        case '^':
                            if (cmd.specialAttribute) {
                                result.startOnlyTxt = true;
                            } else {
                                result.startTxt = true;
                                result.escaped = 0;
                            }
                            break;
                        case '/':
                            result.end = true;
                            result.content += 'return ___v1ew.join("");}}])';
                            return result;
                        }
                        content = content.substring(1);
                    }
                    if (mode !== 'else') {
                        var args = [], hashes = [], i = 0, m;
                        result.content += 'can.Mustache.txt(\n' + (cmd.specialAttribute ? SPECIAL_CONTEXT_OBJ : CONTEXT_OBJ) + ',\n' + (mode ? '"' + mode + '"' : 'null') + ',';
                        (can.trim(content) + ' ').replace(argumentsRegExp, function (whole, arg) {
                            if (i && (m = arg.match(literalNumberStringBooleanRegExp))) {
                                if (m[2]) {
                                    args.push(m[0]);
                                } else {
                                    hashes.push(m[4] + ':' + (m[6] ? m[6] : makeLookupLiteral(m[5])));
                                }
                            } else {
                                args.push(makeLookupLiteral(arg));
                            }
                            i++;
                        });
                        result.content += args.join(',');
                        if (hashes.length) {
                            result.content += ',{' + HASH + ':{' + hashes.join(',') + '}}';
                        }
                    }
                    if (mode && mode !== 'else') {
                        result.content += ',[\n\n';
                    }
                    switch (mode) {
                    case '^':
                    case '#':
                        result.content += '{fn:function(' + ARG_NAMES + '){var ___v1ew = [];';
                        break;
                    case 'else':
                        result.content += 'return ___v1ew.join("");}},\n{inverse:function(' + ARG_NAMES + '){\nvar ___v1ew = [];';
                        break;
                    default:
                        result.content += ')';
                        break;
                    }
                    if (!mode) {
                        result.startTxt = true;
                        result.end = true;
                    }
                    return result;
                }
            }
        ]
    })
});
var helpers = can.view.Scanner.prototype.helpers;
for (var i = 0; i < helpers.length; i++) {
    Mustache.prototype.scanner.helpers.unshift(helpers[i]);
}
Mustache.txt = function (scopeAndOptions, mode, name) {
    var scope = scopeAndOptions.scope, options = scopeAndOptions.options, args = [], helperOptions = {
            fn: function () {
            },
            inverse: function () {
            }
        }, hash, context = scope.attr('.'), getHelper = true, helper;
    for (var i = 3; i < arguments.length; i++) {
        var arg = arguments[i];
        if (mode && can.isArray(arg)) {
            helperOptions = can.extend.apply(can, [helperOptions].concat(arg));
        } else if (arg && arg[HASH]) {
            hash = arg[HASH];
            for (var prop in hash) {
                if (isLookup(hash[prop])) {
                    hash[prop] = Mustache.get(hash[prop].get, scopeAndOptions, false, true);
                }
            }
        } else if (arg && isLookup(arg)) {
            args.push(Mustache.get(arg.get, scopeAndOptions, false, true, true));
        } else {
            args.push(arg);
        }
    }
    if (isLookup(name)) {
        var get = name.get;
        name = Mustache.get(name.get, scopeAndOptions, args.length, false);
        getHelper = get === name;
    }
    helperOptions.fn = makeConvertToScopes(helperOptions.fn, scope, options);
    helperOptions.inverse = makeConvertToScopes(helperOptions.inverse, scope, options);
    if (mode === '^') {
        var tmp = helperOptions.fn;
        helperOptions.fn = helperOptions.inverse;
        helperOptions.inverse = tmp;
    }
    if (helper = getHelper && (typeof name === 'string' && Mustache.getHelper(name, options)) || can.isFunction(name) && !name.isComputed && { fn: name }) {
        can.extend(helperOptions, {
            context: context,
            scope: scope,
            contexts: scope,
            hash: hash
        });
        args.push(helperOptions);
        return function () {
            return helper.fn.apply(context, args) || '';
        };
    }
    return function () {
        var value;
        if (can.isFunction(name) && name.isComputed) {
            value = name();
        } else {
            value = name;
        }
        var validArgs = args.length ? args : [value], valid = true, result = [], i, argIsObserve, arg;
        if (mode) {
            for (i = 0; i < validArgs.length; i++) {
                arg = validArgs[i];
                argIsObserve = typeof arg !== 'undefined' && isObserveLike(arg);
                if (isArrayLike(arg)) {
                    if (mode === '#') {
                        valid = valid && !!(argIsObserve ? arg.attr('length') : arg.length);
                    } else if (mode === '^') {
                        valid = valid && !(argIsObserve ? arg.attr('length') : arg.length);
                    }
                } else {
                    valid = mode === '#' ? valid && !!arg : mode === '^' ? valid && !arg : valid;
                }
            }
        }
        if (valid) {
            if (mode === '#') {
                if (isArrayLike(value)) {
                    var isObserveList = isObserveLike(value);
                    for (i = 0; i < value.length; i++) {
                        result.push(helperOptions.fn(isObserveList ? value.attr('' + i) : value[i]));
                    }
                    return result.join('');
                } else {
                    return helperOptions.fn(value || {}) || '';
                }
            } else if (mode === '^') {
                return helperOptions.inverse(value || {}) || '';
            } else {
                return '' + (value != null ? value : '');
            }
        }
        return '';
    };
};
Mustache.get = function (key, scopeAndOptions, isHelper, isArgument, isLookup) {
    var context = scopeAndOptions.scope.attr('.'), options = scopeAndOptions.options || {};
    if (isHelper) {
        if (Mustache.getHelper(key, options)) {
            return key;
        }
        if (scopeAndOptions.scope && can.isFunction(context[key])) {
            return context[key];
        }
    }
    var computeData = scopeAndOptions.scope.computeData(key, {
            isArgument: isArgument,
            args: [
                context,
                scopeAndOptions.scope
            ]
        }), compute = computeData.compute;
    can.compute.temporarilyBind(compute);
    var initialValue = computeData.initialValue, helperObj = Mustache.getHelper(key, options);
    if (!isLookup && (initialValue === undefined || computeData.scope !== scopeAndOptions.scope) && Mustache.getHelper(key, options)) {
        return key;
    }
    if (!compute.hasDependencies) {
        return initialValue;
    } else {
        return compute;
    }
};
Mustache.resolve = function (value) {
    if (isObserveLike(value) && isArrayLike(value) && value.attr('length')) {
        return value;
    } else if (can.isFunction(value)) {
        return value();
    } else {
        return value;
    }
};
can.view.Options = can.view.Scope.extend({
    init: function (data, parent) {
        if (!data.helpers && !data.partials && !data.tags) {
            data = { helpers: data };
        }
        can.view.Scope.prototype.init.apply(this, arguments);
    }
});
Mustache._helpers = {};
Mustache.registerHelper = function (name, fn) {
    this._helpers[name] = {
        name: name,
        fn: fn
    };
};
Mustache.getHelper = function (name, options) {
    var helper;
    if (options) {
        helper = options.attr('helpers.' + name);
    }
    return helper ? { fn: helper } : this._helpers[name];
};
Mustache.render = function (partial, scope, options) {
    if (!can.view.cached[partial]) {
        var reads = can.__clearReading();
        var scopePartialName = scope.attr(partial);
        if (scopePartialName) {
            partial = scopePartialName;
        }
        can.__setReading(reads);
    }
    return can.view.render(partial, scope, options);
};
Mustache.safeString = function (str) {
    return {
        toString: function () {
            return str;
        }
    };
};
Mustache.renderPartial = function (partialName, scope, options) {
    var partial = options.attr('partials.' + partialName);
    if (partial) {
        return partial.render ? partial.render(scope, options) : partial(scope, options);
    } else {
        return can.Mustache.render(partialName, scope, options);
    }
};
can.each({
    'if': function (expr, options) {
        var value;
        if (can.isFunction(expr)) {
            value = can.compute.truthy(expr)();
        } else {
            value = !!Mustache.resolve(expr);
        }
        if (value) {
            return options.fn(options.contexts || this);
        } else {
            return options.inverse(options.contexts || this);
        }
    },
    'unless': function (expr, options) {
        return Mustache._helpers['if'].fn.apply(this, [
            can.isFunction(expr) ? can.compute(function () {
                return !expr();
            }) : !expr,
            options
        ]);
    },
    'each': function (expr, options) {
        var resolved = Mustache.resolve(expr), result = [], keys, key, i;
        if (can.view.lists && (resolved instanceof can.List || expr && expr.isComputed && resolved === undefined)) {
            return can.view.lists(expr, function (item, index) {
                return options.fn(options.scope.add({ '@index': index }).add(item));
            });
        }
        expr = resolved;
        if (!!expr && isArrayLike(expr)) {
            for (i = 0; i < expr.length; i++) {
                result.push(options.fn(options.scope.add({ '@index': i }).add(expr[i])));
            }
            return result.join('');
        } else if (isObserveLike(expr)) {
            keys = can.Map.keys(expr);
            for (i = 0; i < keys.length; i++) {
                key = keys[i];
                result.push(options.fn(options.scope.add({ '@key': key }).add(expr[key])));
            }
            return result.join('');
        } else if (expr instanceof Object) {
            for (key in expr) {
                result.push(options.fn(options.scope.add({ '@key': key }).add(expr[key])));
            }
            return result.join('');
        }
    },
    'with': function (expr, options) {
        var ctx = expr;
        expr = Mustache.resolve(expr);
        if (!!expr) {
            return options.fn(ctx);
        }
    },
    'log': function (expr, options) {
        if (typeof console !== 'undefined' && console.log) {
            if (!options) {
                console.log(expr.context);
            } else {
                console.log(expr, options.context);
            }
        }
    },
    '@index': function (offset, options) {
        if (!options) {
            options = offset;
            offset = 0;
        }
        var index = options.scope.attr('@index');
        return '' + ((can.isFunction(index) ? index() : index) + offset);
    }
}, function (fn, name) {
    Mustache.registerHelper(name, fn);
});
can.view.register({
    suffix: 'mustache',
    contentType: 'x-mustache-template',
    script: function (id, src) {
        return 'can.Mustache(function(' + ARG_NAMES + ') { ' + new Mustache({
            text: src,
            name: id
        }).template.out + ' })';
    },
    renderer: function (id, text) {
        return Mustache({
            text: text,
            name: id
        });
    }
});
can.mustache.registerHelper = can.proxy(can.Mustache.registerHelper, can.Mustache);
can.mustache.safeString = can.Mustache.safeString;
module.exports = can;

},{"../../compute/compute.js":3,"../../util/util.js":23,"../bindings/bindings.js":24,"../render.js":31,"../scanner.js":32,"../scope/scope.js":33,"../view.js":34}],29:[function(require,module,exports){
/*view/node_lists/node_lists*/
var can = require('../../util/util.js');
require('../elements.js');
var canExpando = true;
try {
    document.createTextNode('')._ = 0;
} catch (ex) {
    canExpando = false;
}
var nodeMap = {}, textNodeMap = {}, expando = 'ejs_' + Math.random(), _id = 0, id = function (node, localMap) {
        var _textNodeMap = localMap || textNodeMap;
        var id = readId(node, _textNodeMap);
        if (id) {
            return id;
        } else {
            if (canExpando || node.nodeType !== 3) {
                ++_id;
                return node[expando] = (node.nodeName ? 'element_' : 'obj_') + _id;
            } else {
                ++_id;
                _textNodeMap['text_' + _id] = node;
                return 'text_' + _id;
            }
        }
    }, readId = function (node, textNodeMap) {
        if (canExpando || node.nodeType !== 3) {
            return node[expando];
        } else {
            for (var textNodeID in textNodeMap) {
                if (textNodeMap[textNodeID] === node) {
                    return textNodeID;
                }
            }
        }
    }, splice = [].splice, push = [].push, itemsInChildListTree = function (list) {
        var count = 0;
        for (var i = 0, len = list.length; i < len; i++) {
            var item = list[i];
            if (item.nodeType) {
                count++;
            } else {
                count += itemsInChildListTree(item);
            }
        }
        return count;
    }, replacementMap = function (replacements, idMap) {
        var map = {};
        for (var i = 0, len = replacements.length; i < len; i++) {
            var node = nodeLists.first(replacements[i]);
            map[id(node, idMap)] = replacements[i];
        }
        return map;
    };
var nodeLists = {
        id: id,
        update: function (nodeList, newNodes) {
            var oldNodes = nodeLists.unregisterChildren(nodeList);
            newNodes = can.makeArray(newNodes);
            var oldListLength = nodeList.length;
            splice.apply(nodeList, [
                0,
                oldListLength
            ].concat(newNodes));
            if (nodeList.replacements) {
                nodeLists.nestReplacements(nodeList);
            } else {
                nodeLists.nestList(nodeList);
            }
            return oldNodes;
        },
        nestReplacements: function (list) {
            var index = 0, idMap = {}, rMap = replacementMap(list.replacements, idMap), rCount = list.replacements.length;
            while (index < list.length && rCount) {
                var node = list[index], replacement = rMap[readId(node, idMap)];
                if (replacement) {
                    list.splice(index, itemsInChildListTree(replacement), replacement);
                    rCount--;
                }
                index++;
            }
            list.replacements = [];
        },
        nestList: function (list) {
            var index = 0;
            while (index < list.length) {
                var node = list[index], childNodeList = nodeMap[id(node)];
                if (childNodeList) {
                    if (childNodeList !== list) {
                        list.splice(index, itemsInChildListTree(childNodeList), childNodeList);
                    }
                } else {
                    nodeMap[id(node)] = list;
                }
                index++;
            }
        },
        last: function (nodeList) {
            var last = nodeList[nodeList.length - 1];
            if (last.nodeType) {
                return last;
            } else {
                return nodeLists.last(last);
            }
        },
        first: function (nodeList) {
            var first = nodeList[0];
            if (first.nodeType) {
                return first;
            } else {
                return nodeLists.first(first);
            }
        },
        register: function (nodeList, unregistered, parent) {
            nodeList.unregistered = unregistered;
            nodeList.parentList = parent;
            if (parent === true) {
                nodeList.replacements = [];
            } else if (parent) {
                parent.replacements.push(nodeList);
                nodeList.replacements = [];
            } else {
                nodeLists.nestList(nodeList);
            }
            return nodeList;
        },
        unregisterChildren: function (nodeList) {
            var nodes = [];
            can.each(nodeList, function (node) {
                if (node.nodeType) {
                    if (!nodeList.replacements) {
                        delete nodeMap[id(node)];
                    }
                    nodes.push(node);
                } else {
                    push.apply(nodes, nodeLists.unregister(node));
                }
            });
            return nodes;
        },
        unregister: function (nodeList) {
            var nodes = nodeLists.unregisterChildren(nodeList);
            if (nodeList.unregistered) {
                var unregisteredCallback = nodeList.unregistered;
                delete nodeList.unregistered;
                delete nodeList.replacements;
                unregisteredCallback();
            }
            return nodes;
        },
        nodeMap: nodeMap
    };
can.view.nodeLists = nodeLists;
module.exports = nodeLists;

},{"../../util/util.js":23,"../elements.js":26}],30:[function(require,module,exports){
/*view/parser/parser*/
var can = require('../view.js');
function makeMap(str) {
    var obj = {}, items = str.split(',');
    for (var i = 0; i < items.length; i++) {
        obj[items[i]] = true;
    }
    return obj;
}
function handleIntermediate(intermediate, handler) {
    for (var i = 0, len = intermediate.length; i < len; i++) {
        var item = intermediate[i];
        handler[item.tokenType].apply(handler, item.args);
    }
    return intermediate;
}
var alphaNumericHU = '-:A-Za-z0-9_', attributeNames = '[a-zA-Z_:][' + alphaNumericHU + ':.]*', spaceEQspace = '\\s*=\\s*', dblQuote2dblQuote = '"((?:\\\\.|[^"])*)"', quote2quote = '\'((?:\\\\.|[^\'])*)\'', attributeEqAndValue = '(?:' + spaceEQspace + '(?:' + '(?:"[^"]*")|(?:\'[^\']*\')|[^>\\s]+))?', matchStash = '\\{\\{[^\\}]*\\}\\}\\}?', stash = '\\{\\{([^\\}]*)\\}\\}\\}?', startTag = new RegExp('^<([' + alphaNumericHU + ']+)' + '(' + '(?:\\s*' + '(?:(?:' + '(?:' + attributeNames + ')?' + attributeEqAndValue + ')|' + '(?:' + matchStash + ')+)' + ')*' + ')\\s*(\\/?)>'), endTag = new RegExp('^<\\/([' + alphaNumericHU + ']+)[^>]*>'), attr = new RegExp('(?:' + '(?:(' + attributeNames + ')|' + stash + ')' + '(?:' + spaceEQspace + '(?:' + '(?:' + dblQuote2dblQuote + ')|(?:' + quote2quote + ')|([^>\\s]+)' + ')' + ')?)', 'g'), mustache = new RegExp(stash, 'g'), txtBreak = /<|\{\{/;
var empty = makeMap('area,base,basefont,br,col,frame,hr,img,input,isindex,link,meta,param,embed');
var block = makeMap('a,address,article,applet,aside,audio,blockquote,button,canvas,center,dd,del,dir,div,dl,dt,fieldset,figcaption,figure,footer,form,frameset,h1,h2,h3,h4,h5,h6,header,hgroup,hr,iframe,ins,isindex,li,map,menu,noframes,noscript,object,ol,output,p,pre,section,script,table,tbody,td,tfoot,th,thead,tr,ul,video');
var inline = makeMap('abbr,acronym,applet,b,basefont,bdo,big,br,button,cite,code,del,dfn,em,font,i,iframe,img,input,ins,kbd,label,map,object,q,s,samp,script,select,small,span,strike,strong,sub,sup,textarea,tt,u,var');
var closeSelf = makeMap('colgroup,dd,dt,li,options,p,td,tfoot,th,thead,tr');
var fillAttrs = makeMap('checked,compact,declare,defer,disabled,ismap,multiple,nohref,noresize,noshade,nowrap,readonly,selected');
var special = makeMap('script,style');
var tokenTypes = 'start,end,close,attrStart,attrEnd,attrValue,chars,comment,special,done'.split(',');
var fn = function () {
};
var HTMLParser = function (html, handler, returnIntermediate) {
    if (typeof html === 'object') {
        return handleIntermediate(html, handler);
    }
    var intermediate = [];
    handler = handler || {};
    if (returnIntermediate) {
        can.each(tokenTypes, function (name) {
            var callback = handler[name] || fn;
            handler[name] = function () {
                if (callback.apply(this, arguments) !== false) {
                    intermediate.push({
                        tokenType: name,
                        args: can.makeArray(arguments)
                    });
                }
            };
        });
    }
    function parseStartTag(tag, tagName, rest, unary) {
        tagName = tagName.toLowerCase();
        if (block[tagName]) {
            while (stack.last() && inline[stack.last()]) {
                parseEndTag('', stack.last());
            }
        }
        if (closeSelf[tagName] && stack.last() === tagName) {
            parseEndTag('', tagName);
        }
        unary = empty[tagName] || !!unary;
        handler.start(tagName, unary);
        if (!unary) {
            stack.push(tagName);
        }
        HTMLParser.parseAttrs(rest, handler);
        handler.end(tagName, unary);
    }
    function parseEndTag(tag, tagName) {
        var pos;
        if (!tagName) {
            pos = 0;
        } else {
            for (pos = stack.length - 1; pos >= 0; pos--) {
                if (stack[pos] === tagName) {
                    break;
                }
            }
        }
        if (pos >= 0) {
            for (var i = stack.length - 1; i >= pos; i--) {
                if (handler.close) {
                    handler.close(stack[i]);
                }
            }
            stack.length = pos;
        }
    }
    function parseMustache(mustache, inside) {
        if (handler.special) {
            handler.special(inside);
        }
    }
    var index, chars, match, stack = [], last = html;
    stack.last = function () {
        return this[this.length - 1];
    };
    while (html) {
        chars = true;
        if (!stack.last() || !special[stack.last()]) {
            if (html.indexOf('<!--') === 0) {
                index = html.indexOf('-->');
                if (index >= 0) {
                    if (handler.comment) {
                        handler.comment(html.substring(4, index));
                    }
                    html = html.substring(index + 3);
                    chars = false;
                }
            } else if (html.indexOf('</') === 0) {
                match = html.match(endTag);
                if (match) {
                    html = html.substring(match[0].length);
                    match[0].replace(endTag, parseEndTag);
                    chars = false;
                }
            } else if (html.indexOf('<') === 0) {
                match = html.match(startTag);
                if (match) {
                    html = html.substring(match[0].length);
                    match[0].replace(startTag, parseStartTag);
                    chars = false;
                }
            } else if (html.indexOf('{{') === 0) {
                match = html.match(mustache);
                if (match) {
                    html = html.substring(match[0].length);
                    match[0].replace(mustache, parseMustache);
                }
            }
            if (chars) {
                index = html.search(txtBreak);
                var text = index < 0 ? html : html.substring(0, index);
                html = index < 0 ? '' : html.substring(index);
                if (handler.chars && text) {
                    handler.chars(text);
                }
            }
        } else {
            html = html.replace(new RegExp('([\\s\\S]*?)</' + stack.last() + '[^>]*>'), function (all, text) {
                text = text.replace(/<!--([\s\S]*?)-->|<!\[CDATA\[([\s\S]*?)]]>/g, '$1$2');
                if (handler.chars) {
                    handler.chars(text);
                }
                return '';
            });
            parseEndTag('', stack.last());
        }
        if (html === last) {
            throw 'Parse Error: ' + html;
        }
        last = html;
    }
    parseEndTag();
    handler.done();
    return intermediate;
};
HTMLParser.parseAttrs = function (rest, handler) {
    (rest != null ? rest : '').replace(attr, function (text, name, special, dblQuote, singleQuote, val) {
        if (special) {
            handler.special(special);
        }
        if (name || dblQuote || singleQuote || val) {
            var value = arguments[3] ? arguments[3] : arguments[4] ? arguments[4] : arguments[5] ? arguments[5] : fillAttrs[name.toLowerCase()] ? name : '';
            handler.attrStart(name || '');
            var last = mustache.lastIndex = 0, res = mustache.exec(value), chars;
            while (res) {
                chars = value.substring(last, mustache.lastIndex - res[0].length);
                if (chars.length) {
                    handler.attrValue(chars);
                }
                handler.special(res[1]);
                last = mustache.lastIndex;
                res = mustache.exec(value);
            }
            chars = value.substr(last, value.length);
            if (chars) {
                handler.attrValue(chars);
            }
            handler.attrEnd(name || '');
        }
    });
};
can.view.parser = HTMLParser;
module.exports = HTMLParser;

},{"../view.js":34}],31:[function(require,module,exports){
/*view/render*/
var can = require('./view.js');
var elements = require('./elements.js');
var live = require('./live/live.js');
require('../util/string/string.js');
var pendingHookups = [], tagChildren = function (tagName) {
        var newTag = elements.tagMap[tagName] || 'span';
        if (newTag === 'span') {
            return '@@!!@@';
        }
        return '<' + newTag + '>' + tagChildren(newTag) + '</' + newTag + '>';
    }, contentText = function (input, tag) {
        if (typeof input === 'string') {
            return input;
        }
        if (!input && input !== 0) {
            return '';
        }
        var hook = input.hookup && function (el, id) {
                input.hookup.call(input, el, id);
            } || typeof input === 'function' && input;
        if (hook) {
            if (tag) {
                return '<' + tag + ' ' + can.view.hook(hook) + '></' + tag + '>';
            } else {
                pendingHookups.push(hook);
            }
            return '';
        }
        return '' + input;
    }, contentEscape = function (txt, tag) {
        return typeof txt === 'string' || typeof txt === 'number' ? can.esc(txt) : contentText(txt, tag);
    }, withinTemplatedSectionWithinAnElement = false, emptyHandler = function () {
    };
var lastHookups;
can.extend(can.view, {
    live: live,
    setupLists: function () {
        var old = can.view.lists, data;
        can.view.lists = function (list, renderer) {
            data = {
                list: list,
                renderer: renderer
            };
            return Math.random();
        };
        return function () {
            can.view.lists = old;
            return data;
        };
    },
    getHooks: function () {
        var hooks = pendingHookups.slice(0);
        lastHookups = hooks;
        pendingHookups = [];
        return hooks;
    },
    onlytxt: function (self, func) {
        return contentEscape(func.call(self));
    },
    txt: function (escape, tagName, status, self, func) {
        var tag = elements.tagMap[tagName] || 'span', setupLiveBinding = false, value, listData, compute, unbind = emptyHandler, attributeName;
        if (withinTemplatedSectionWithinAnElement) {
            value = func.call(self);
        } else {
            if (typeof status === 'string' || status === 1) {
                withinTemplatedSectionWithinAnElement = true;
            }
            var listTeardown = can.view.setupLists();
            unbind = function () {
                compute.unbind('change', emptyHandler);
            };
            compute = can.compute(func, self, false);
            compute.bind('change', emptyHandler);
            listData = listTeardown();
            value = compute();
            withinTemplatedSectionWithinAnElement = false;
            setupLiveBinding = compute.hasDependencies;
        }
        if (listData) {
            unbind();
            return '<' + tag + can.view.hook(function (el, parentNode) {
                live.list(el, listData.list, listData.renderer, self, parentNode);
            }) + '></' + tag + '>';
        }
        if (!setupLiveBinding || typeof value === 'function') {
            unbind();
            return (withinTemplatedSectionWithinAnElement || escape === 2 || !escape ? contentText : contentEscape)(value, status === 0 && tag);
        }
        var contentProp = elements.tagToContentPropMap[tagName];
        if (status === 0 && !contentProp) {
            return '<' + tag + can.view.hook(escape && typeof value !== 'object' ? function (el, parentNode) {
                live.text(el, compute, parentNode);
                unbind();
            } : function (el, parentNode) {
                live.html(el, compute, parentNode);
                unbind();
            }) + '>' + tagChildren(tag) + '</' + tag + '>';
        } else if (status === 1) {
            pendingHookups.push(function (el) {
                live.attributes(el, compute, compute());
                unbind();
            });
            return compute();
        } else if (escape === 2) {
            attributeName = status;
            pendingHookups.push(function (el) {
                live.specialAttribute(el, attributeName, compute);
                unbind();
            });
            return compute();
        } else {
            attributeName = status === 0 ? contentProp : status;
            (status === 0 ? lastHookups : pendingHookups).push(function (el) {
                live.attribute(el, attributeName, compute);
                unbind();
            });
            return live.attributePlaceholder;
        }
    }
});
module.exports = can;

},{"../util/string/string.js":22,"./elements.js":26,"./live/live.js":27,"./view.js":34}],32:[function(require,module,exports){
/*view/scanner*/
var can = require('./view.js');
var elements = require('./elements.js');
var viewCallbacks = require('./callbacks/callbacks.js');
var newLine = /(\r|\n)+/g, notEndTag = /\//, clean = function (content) {
        return content.split('\\').join('\\\\').split('\n').join('\\n').split('"').join('\\"').split('\t').join('\\t');
    }, getTag = function (tagName, tokens, i) {
        if (tagName) {
            return tagName;
        } else {
            while (i < tokens.length) {
                if (tokens[i] === '<' && !notEndTag.test(tokens[i + 1])) {
                    return elements.reverseTagMap[tokens[i + 1]] || 'span';
                }
                i++;
            }
        }
        return '';
    }, bracketNum = function (content) {
        return --content.split('{').length - --content.split('}').length;
    }, myEval = function (script) {
        eval(script);
    }, attrReg = /([^\s]+)[\s]*=[\s]*$/, startTxt = 'var ___v1ew = [];', finishTxt = 'return ___v1ew.join(\'\')', put_cmd = '___v1ew.push(\n', insert_cmd = put_cmd, htmlTag = null, quote = null, beforeQuote = null, rescan = null, getAttrName = function () {
        var matches = beforeQuote.match(attrReg);
        return matches && matches[1];
    }, status = function () {
        return quote ? '\'' + getAttrName() + '\'' : htmlTag ? 1 : 0;
    }, top = function (stack) {
        return stack[stack.length - 1];
    }, Scanner;
can.view.Scanner = Scanner = function (options) {
    can.extend(this, {
        text: {},
        tokens: []
    }, options);
    this.text.options = this.text.options || '';
    this.tokenReg = [];
    this.tokenSimple = {
        '<': '<',
        '>': '>',
        '"': '"',
        '\'': '\''
    };
    this.tokenComplex = [];
    this.tokenMap = {};
    for (var i = 0, token; token = this.tokens[i]; i++) {
        if (token[2]) {
            this.tokenReg.push(token[2]);
            this.tokenComplex.push({
                abbr: token[1],
                re: new RegExp(token[2]),
                rescan: token[3]
            });
        } else {
            this.tokenReg.push(token[1]);
            this.tokenSimple[token[1]] = token[0];
        }
        this.tokenMap[token[0]] = token[1];
    }
    this.tokenReg = new RegExp('(' + this.tokenReg.slice(0).concat([
        '<',
        '>',
        '"',
        '\''
    ]).join('|') + ')', 'g');
};
Scanner.prototype = {
    helpers: [],
    scan: function (source, name) {
        var tokens = [], last = 0, simple = this.tokenSimple, complex = this.tokenComplex;
        source = source.replace(newLine, '\n');
        if (this.transform) {
            source = this.transform(source);
        }
        source.replace(this.tokenReg, function (whole, part) {
            var offset = arguments[arguments.length - 2];
            if (offset > last) {
                tokens.push(source.substring(last, offset));
            }
            if (simple[whole]) {
                tokens.push(whole);
            } else {
                for (var i = 0, token; token = complex[i]; i++) {
                    if (token.re.test(whole)) {
                        tokens.push(token.abbr);
                        if (token.rescan) {
                            tokens.push(token.rescan(part));
                        }
                        break;
                    }
                }
            }
            last = offset + part.length;
        });
        if (last < source.length) {
            tokens.push(source.substr(last));
        }
        var content = '', buff = [startTxt + (this.text.start || '')], put = function (content, bonus) {
                buff.push(put_cmd, '"', clean(content), '"' + (bonus || '') + ');');
            }, endStack = [], lastToken, startTag = null, magicInTag = false, specialStates = {
                attributeHookups: [],
                tagHookups: [],
                lastTagHookup: ''
            }, popTagHookup = function () {
                specialStates.lastTagHookup = specialStates.tagHookups.pop() + specialStates.tagHookups.length;
            }, tagName = '', tagNames = [], popTagName = false, bracketCount, specialAttribute = false, i = 0, token, tmap = this.tokenMap, attrName;
        htmlTag = quote = beforeQuote = null;
        for (; (token = tokens[i++]) !== undefined;) {
            if (startTag === null) {
                switch (token) {
                case tmap.left:
                case tmap.escapeLeft:
                case tmap.returnLeft:
                    magicInTag = htmlTag && 1;
                case tmap.commentLeft:
                    startTag = token;
                    if (content.length) {
                        put(content);
                    }
                    content = '';
                    break;
                case tmap.escapeFull:
                    magicInTag = htmlTag && 1;
                    rescan = 1;
                    startTag = tmap.escapeLeft;
                    if (content.length) {
                        put(content);
                    }
                    rescan = tokens[i++];
                    content = rescan.content || rescan;
                    if (rescan.before) {
                        put(rescan.before);
                    }
                    tokens.splice(i, 0, tmap.right);
                    break;
                case tmap.commentFull:
                    break;
                case tmap.templateLeft:
                    content += tmap.left;
                    break;
                case '<':
                    if (tokens[i].indexOf('!--') !== 0) {
                        htmlTag = 1;
                        magicInTag = 0;
                    }
                    content += token;
                    break;
                case '>':
                    htmlTag = 0;
                    var emptyElement = content.substr(content.length - 1) === '/' || content.substr(content.length - 2) === '--', attrs = '';
                    if (specialStates.attributeHookups.length) {
                        attrs = 'attrs: [\'' + specialStates.attributeHookups.join('\',\'') + '\'], ';
                        specialStates.attributeHookups = [];
                    }
                    if (tagName + specialStates.tagHookups.length !== specialStates.lastTagHookup && tagName === top(specialStates.tagHookups)) {
                        if (emptyElement) {
                            content = content.substr(0, content.length - 1);
                        }
                        buff.push(put_cmd, '"', clean(content), '"', ',can.view.pending({tagName:\'' + tagName + '\',' + attrs + 'scope: ' + (this.text.scope || 'this') + this.text.options);
                        if (emptyElement) {
                            buff.push('}));');
                            content = '/>';
                            popTagHookup();
                        } else if (tokens[i] === '<' && tokens[i + 1] === '/' + tagName) {
                            buff.push('}));');
                            content = token;
                            popTagHookup();
                        } else {
                            buff.push(',subtemplate: function(' + this.text.argNames + '){\n' + startTxt + (this.text.start || ''));
                            content = '';
                        }
                    } else if (magicInTag || !popTagName && elements.tagToContentPropMap[tagNames[tagNames.length - 1]] || attrs) {
                        var pendingPart = ',can.view.pending({' + attrs + 'scope: ' + (this.text.scope || 'this') + this.text.options + '}),"';
                        if (emptyElement) {
                            put(content.substr(0, content.length - 1), pendingPart + '/>"');
                        } else {
                            put(content, pendingPart + '>"');
                        }
                        content = '';
                        magicInTag = 0;
                    } else {
                        content += token;
                    }
                    if (emptyElement || popTagName) {
                        tagNames.pop();
                        tagName = tagNames[tagNames.length - 1];
                        popTagName = false;
                    }
                    specialStates.attributeHookups = [];
                    break;
                case '\'':
                case '"':
                    if (htmlTag) {
                        if (quote && quote === token) {
                            quote = null;
                            var attr = getAttrName();
                            if (viewCallbacks.attr(attr)) {
                                specialStates.attributeHookups.push(attr);
                            }
                            if (specialAttribute) {
                                content += token;
                                put(content);
                                buff.push(finishTxt, '}));\n');
                                content = '';
                                specialAttribute = false;
                                break;
                            }
                        } else if (quote === null) {
                            quote = token;
                            beforeQuote = lastToken;
                            attrName = getAttrName();
                            if (tagName === 'img' && attrName === 'src' || attrName === 'style') {
                                put(content.replace(attrReg, ''));
                                content = '';
                                specialAttribute = true;
                                buff.push(insert_cmd, 'can.view.txt(2,\'' + getTag(tagName, tokens, i) + '\',' + status() + ',this,function(){', startTxt);
                                put(attrName + '=' + token);
                                break;
                            }
                        }
                    }
                default:
                    if (lastToken === '<') {
                        tagName = token.substr(0, 3) === '!--' ? '!--' : token.split(/\s/)[0];
                        var isClosingTag = false, cleanedTagName;
                        if (tagName.indexOf('/') === 0) {
                            isClosingTag = true;
                            cleanedTagName = tagName.substr(1);
                        }
                        if (isClosingTag) {
                            if (top(tagNames) === cleanedTagName) {
                                tagName = cleanedTagName;
                                popTagName = true;
                            }
                            if (top(specialStates.tagHookups) === cleanedTagName) {
                                put(content.substr(0, content.length - 1));
                                buff.push(finishTxt + '}}) );');
                                content = '><';
                                popTagHookup();
                            }
                        } else {
                            if (tagName.lastIndexOf('/') === tagName.length - 1) {
                                tagName = tagName.substr(0, tagName.length - 1);
                            }
                            if (tagName !== '!--' && viewCallbacks.tag(tagName)) {
                                if (tagName === 'content' && elements.tagMap[top(tagNames)]) {
                                    token = token.replace('content', elements.tagMap[top(tagNames)]);
                                }
                                specialStates.tagHookups.push(tagName);
                            }
                            tagNames.push(tagName);
                        }
                    }
                    content += token;
                    break;
                }
            } else {
                switch (token) {
                case tmap.right:
                case tmap.returnRight:
                    switch (startTag) {
                    case tmap.left:
                        bracketCount = bracketNum(content);
                        if (bracketCount === 1) {
                            buff.push(insert_cmd, 'can.view.txt(0,\'' + getTag(tagName, tokens, i) + '\',' + status() + ',this,function(){', startTxt, content);
                            endStack.push({
                                before: '',
                                after: finishTxt + '}));\n'
                            });
                        } else {
                            last = endStack.length && bracketCount === -1 ? endStack.pop() : { after: ';' };
                            if (last.before) {
                                buff.push(last.before);
                            }
                            buff.push(content, ';', last.after);
                        }
                        break;
                    case tmap.escapeLeft:
                    case tmap.returnLeft:
                        bracketCount = bracketNum(content);
                        if (bracketCount) {
                            endStack.push({
                                before: finishTxt,
                                after: '}));\n'
                            });
                        }
                        var escaped = startTag === tmap.escapeLeft ? 1 : 0, commands = {
                                insert: insert_cmd,
                                tagName: getTag(tagName, tokens, i),
                                status: status(),
                                specialAttribute: specialAttribute
                            };
                        for (var ii = 0; ii < this.helpers.length; ii++) {
                            var helper = this.helpers[ii];
                            if (helper.name.test(content)) {
                                content = helper.fn(content, commands);
                                if (helper.name.source === /^>[\s]*\w*/.source) {
                                    escaped = 0;
                                }
                                break;
                            }
                        }
                        if (typeof content === 'object') {
                            if (content.startTxt && content.end && specialAttribute) {
                                buff.push(insert_cmd, 'can.view.toStr( ', content.content, '() ) );');
                            } else {
                                if (content.startTxt) {
                                    buff.push(insert_cmd, 'can.view.txt(\n' + (typeof status() === 'string' || (content.escaped != null ? content.escaped : escaped)) + ',\n\'' + tagName + '\',\n' + status() + ',\nthis,\n');
                                } else if (content.startOnlyTxt) {
                                    buff.push(insert_cmd, 'can.view.onlytxt(this,\n');
                                }
                                buff.push(content.content);
                                if (content.end) {
                                    buff.push('));');
                                }
                            }
                        } else if (specialAttribute) {
                            buff.push(insert_cmd, content, ');');
                        } else {
                            buff.push(insert_cmd, 'can.view.txt(\n' + (typeof status() === 'string' || escaped) + ',\n\'' + tagName + '\',\n' + status() + ',\nthis,\nfunction(){ ' + (this.text.escape || '') + 'return ', content, bracketCount ? startTxt : '}));\n');
                        }
                        if (rescan && rescan.after && rescan.after.length) {
                            put(rescan.after.length);
                            rescan = null;
                        }
                        break;
                    }
                    startTag = null;
                    content = '';
                    break;
                case tmap.templateLeft:
                    content += tmap.left;
                    break;
                default:
                    content += token;
                    break;
                }
            }
            lastToken = token;
        }
        if (content.length) {
            put(content);
        }
        buff.push(';');
        var template = buff.join(''), out = { out: (this.text.outStart || '') + template + ' ' + finishTxt + (this.text.outEnd || '') };
        myEval.call(out, 'this.fn = (function(' + this.text.argNames + '){' + out.out + '});\r\n//# sourceURL=' + name + '.js');
        return out;
    }
};
can.view.pending = function (viewData) {
    var hooks = can.view.getHooks();
    return can.view.hook(function (el) {
        can.each(hooks, function (fn) {
            fn(el);
        });
        viewData.templateType = 'legacy';
        if (viewData.tagName) {
            viewCallbacks.tagHandler(el, viewData.tagName, viewData);
        }
        can.each(viewData && viewData.attrs || [], function (attributeName) {
            viewData.attributeName = attributeName;
            var callback = viewCallbacks.attr(attributeName);
            if (callback) {
                callback(el, viewData);
            }
        });
    });
};
can.view.tag('content', function (el, tagData) {
    return tagData.scope;
});
can.view.Scanner = Scanner;
module.exports = Scanner;

},{"./callbacks/callbacks.js":25,"./elements.js":26,"./view.js":34}],33:[function(require,module,exports){
/*view/scope/scope*/
var can = require('../../util/util.js');
require('../../construct/construct.js');
require('../../map/map.js');
require('../../list/list.js');
require('../view.js');
require('../../compute/compute.js');
var escapeReg = /(\\)?\./g, escapeDotReg = /\\\./g, getNames = function (attr) {
        var names = [], last = 0;
        attr.replace(escapeReg, function (first, second, index) {
            if (!second) {
                names.push(attr.slice(last, index).replace(escapeDotReg, '.'));
                last = index + first.length;
            }
        });
        names.push(attr.slice(last).replace(escapeDotReg, '.'));
        return names;
    };
var Scope = can.Construct.extend({ read: can.compute.read }, {
        init: function (context, parent) {
            this._context = context;
            this._parent = parent;
            this.__cache = {};
        },
        attr: function (key, value) {
            var previousReads = can.__clearReading(), res = this.read(key, {
                    isArgument: true,
                    returnObserveMethods: true,
                    proxyMethods: false
                });
            if (arguments.length === 2) {
                var lastIndex = key.lastIndexOf('.'), readKey = lastIndex !== -1 ? key.substring(0, lastIndex) : '.', obj = this.read(readKey, {
                        isArgument: true,
                        returnObserveMethods: true,
                        proxyMethods: false
                    }).value;
                if (lastIndex !== -1) {
                    key = key.substring(lastIndex + 1, key.length);
                }
                can.compute.set(obj, key, value);
            }
            can.__setReading(previousReads);
            return res.value;
        },
        add: function (context) {
            if (context !== this._context) {
                return new this.constructor(context, this);
            } else {
                return this;
            }
        },
        computeData: function (key, options) {
            options = options || { args: [] };
            var self = this, rootObserve, rootReads, computeData = {
                    compute: can.compute(function (newVal) {
                        if (arguments.length) {
                            if (rootObserve.isComputed) {
                                rootObserve(newVal);
                            } else if (rootReads.length) {
                                var last = rootReads.length - 1;
                                var obj = rootReads.length ? can.compute.read(rootObserve, rootReads.slice(0, last)).value : rootObserve;
                                can.compute.set(obj, rootReads[last], newVal);
                            }
                        } else {
                            if (rootObserve) {
                                return can.compute.read(rootObserve, rootReads, options).value;
                            }
                            var data = self.read(key, options);
                            rootObserve = data.rootObserve;
                            rootReads = data.reads;
                            computeData.scope = data.scope;
                            computeData.initialValue = data.value;
                            computeData.reads = data.reads;
                            computeData.root = rootObserve;
                            return data.value;
                        }
                    })
                };
            return computeData;
        },
        compute: function (key, options) {
            return this.computeData(key, options).compute;
        },
        read: function (attr, options) {
            var stopLookup;
            if (attr.substr(0, 2) === './') {
                stopLookup = true;
                attr = attr.substr(2);
            } else if (attr.substr(0, 3) === '../') {
                return this._parent.read(attr.substr(3), options);
            } else if (attr === '..') {
                return { value: this._parent._context };
            } else if (attr === '.' || attr === 'this') {
                return { value: this._context };
            }
            var names = attr.indexOf('\\.') === -1 ? attr.split('.') : getNames(attr), context, scope = this, defaultObserve, defaultReads = [], defaultPropertyDepth = -1, defaultComputeReadings, defaultScope, currentObserve, currentReads;
            while (scope) {
                context = scope._context;
                if (context !== null) {
                    var data = can.compute.read(context, names, can.simpleExtend({
                            foundObservable: function (observe, nameIndex) {
                                currentObserve = observe;
                                currentReads = names.slice(nameIndex);
                            },
                            earlyExit: function (parentValue, nameIndex) {
                                if (nameIndex > defaultPropertyDepth) {
                                    defaultObserve = currentObserve;
                                    defaultReads = currentReads;
                                    defaultPropertyDepth = nameIndex;
                                    defaultScope = scope;
                                    defaultComputeReadings = can.__clearReading();
                                }
                            },
                            executeAnonymousFunctions: true
                        }, options));
                    if (data.value !== undefined) {
                        return {
                            scope: scope,
                            rootObserve: currentObserve,
                            value: data.value,
                            reads: currentReads
                        };
                    }
                }
                can.__clearReading();
                if (!stopLookup) {
                    scope = scope._parent;
                } else {
                    scope = null;
                }
            }
            if (defaultObserve) {
                can.__setReading(defaultComputeReadings);
                return {
                    scope: defaultScope,
                    rootObserve: defaultObserve,
                    reads: defaultReads,
                    value: undefined
                };
            } else {
                return {
                    names: names,
                    value: undefined
                };
            }
        }
    });
can.view.Scope = Scope;
module.exports = Scope;

},{"../../compute/compute.js":3,"../../construct/construct.js":4,"../../list/list.js":8,"../../map/map.js":10,"../../util/util.js":23,"../view.js":34}],34:[function(require,module,exports){
/*view/view*/
var can = require('../util/util.js');
var isFunction = can.isFunction, makeArray = can.makeArray, hookupId = 1;
var makeRenderer = function (textRenderer) {
    var renderer = function () {
        return $view.frag(textRenderer.apply(this, arguments));
    };
    renderer.render = function () {
        return textRenderer.apply(textRenderer, arguments);
    };
    return renderer;
};
var checkText = function (text, url) {
    if (!text.length) {
        throw 'can.view: No template or empty template:' + url;
    }
};
var getRenderer = function (obj, async) {
    if (isFunction(obj)) {
        var def = can.Deferred();
        return def.resolve(obj);
    }
    var url = typeof obj === 'string' ? obj : obj.url, suffix = obj.engine && '.' + obj.engine || url.match(/\.[\w\d]+$/), type, el, id;
    if (url.match(/^#/)) {
        url = url.substr(1);
    }
    if (el = document.getElementById(url)) {
        suffix = '.' + el.type.match(/\/(x\-)?(.+)/)[2];
    }
    if (!suffix && !$view.cached[url]) {
        url += suffix = $view.ext;
    }
    if (can.isArray(suffix)) {
        suffix = suffix[0];
    }
    id = $view.toId(url);
    if (url.match(/^\/\//)) {
        url = url.substr(2);
        url = !window.steal ? url : steal.config().root.mapJoin('' + steal.id(url));
    }
    if (window.require) {
        if (require.toUrl) {
            url = require.toUrl(url);
        }
    }
    type = $view.types[suffix];
    if ($view.cached[id]) {
        return $view.cached[id];
    } else if (el) {
        return $view.registerView(id, el.innerHTML, type);
    } else {
        var d = new can.Deferred();
        can.ajax({
            async: async,
            url: url,
            dataType: 'text',
            error: function (jqXHR) {
                checkText('', url);
                d.reject(jqXHR);
            },
            success: function (text) {
                checkText(text, url);
                $view.registerView(id, text, type, d);
            }
        });
        return d;
    }
};
var getDeferreds = function (data) {
    var deferreds = [];
    if (can.isDeferred(data)) {
        return [data];
    } else {
        for (var prop in data) {
            if (can.isDeferred(data[prop])) {
                deferreds.push(data[prop]);
            }
        }
    }
    return deferreds;
};
var usefulPart = function (resolved) {
    return can.isArray(resolved) && resolved[1] === 'success' ? resolved[0] : resolved;
};
var $view = can.view = can.template = function (view, data, helpers, callback) {
        if (isFunction(helpers)) {
            callback = helpers;
            helpers = undefined;
        }
        return $view.renderAs('fragment', view, data, helpers, callback);
    };
can.extend($view, {
    frag: function (result, parentNode) {
        return $view.hookup($view.fragment(result), parentNode);
    },
    fragment: function (result) {
        if (typeof result !== 'string' && result.nodeType === 11) {
            return result;
        }
        var frag = can.buildFragment(result, document.body);
        if (!frag.childNodes.length) {
            frag.appendChild(document.createTextNode(''));
        }
        return frag;
    },
    toId: function (src) {
        return can.map(src.toString().split(/\/|\./g), function (part) {
            if (part) {
                return part;
            }
        }).join('_');
    },
    toStr: function (txt) {
        return txt == null ? '' : '' + txt;
    },
    hookup: function (fragment, parentNode) {
        var hookupEls = [], id, func;
        can.each(fragment.childNodes ? can.makeArray(fragment.childNodes) : fragment, function (node) {
            if (node.nodeType === 1) {
                hookupEls.push(node);
                hookupEls.push.apply(hookupEls, can.makeArray(node.getElementsByTagName('*')));
            }
        });
        can.each(hookupEls, function (el) {
            if (el.getAttribute && (id = el.getAttribute('data-view-id')) && (func = $view.hookups[id])) {
                func(el, parentNode, id);
                delete $view.hookups[id];
                el.removeAttribute('data-view-id');
            }
        });
        return fragment;
    },
    hookups: {},
    hook: function (cb) {
        $view.hookups[++hookupId] = cb;
        return ' data-view-id=\'' + hookupId + '\'';
    },
    cached: {},
    cachedRenderers: {},
    cache: true,
    register: function (info) {
        this.types['.' + info.suffix] = info;
        can[info.suffix] = $view[info.suffix] = function (id, text) {
            var renderer, renderFunc;
            if (!text) {
                renderFunc = function () {
                    if (!renderer) {
                        if (info.fragRenderer) {
                            renderer = info.fragRenderer(null, id);
                        } else {
                            renderer = makeRenderer(info.renderer(null, id));
                        }
                    }
                    return renderer.apply(this, arguments);
                };
                renderFunc.render = function () {
                    var textRenderer = info.renderer(null, id);
                    return textRenderer.apply(textRenderer, arguments);
                };
                return renderFunc;
            }
            var registeredRenderer = function () {
                if (!renderer) {
                    if (info.fragRenderer) {
                        renderer = info.fragRenderer(id, text);
                    } else {
                        renderer = info.renderer(id, text);
                    }
                }
                return renderer.apply(this, arguments);
            };
            if (info.fragRenderer) {
                return $view.preload(id, registeredRenderer);
            } else {
                return $view.preloadStringRenderer(id, registeredRenderer);
            }
        };
    },
    types: {},
    ext: '.ejs',
    registerScript: function (type, id, src) {
        return 'can.view.preloadStringRenderer(\'' + id + '\',' + $view.types['.' + type].script(id, src) + ');';
    },
    preload: function (id, renderer) {
        var def = $view.cached[id] = new can.Deferred().resolve(function (data, helpers) {
                return renderer.call(data, data, helpers);
            });
        def.__view_id = id;
        $view.cachedRenderers[id] = renderer;
        return renderer;
    },
    preloadStringRenderer: function (id, stringRenderer) {
        return this.preload(id, makeRenderer(stringRenderer));
    },
    render: function (view, data, helpers, callback) {
        return can.view.renderAs('string', view, data, helpers, callback);
    },
    renderTo: function (format, renderer, data, helpers) {
        return (format === 'string' && renderer.render ? renderer.render : renderer)(data, helpers);
    },
    renderAs: function (format, view, data, helpers, callback) {
        if (isFunction(helpers)) {
            callback = helpers;
            helpers = undefined;
        }
        var deferreds = getDeferreds(data);
        var reading, deferred, dataCopy, async, response;
        if (deferreds.length) {
            deferred = new can.Deferred();
            dataCopy = can.extend({}, data);
            deferreds.push(getRenderer(view, true));
            can.when.apply(can, deferreds).then(function (resolved) {
                var objs = makeArray(arguments), renderer = objs.pop(), result;
                if (can.isDeferred(data)) {
                    dataCopy = usefulPart(resolved);
                } else {
                    for (var prop in data) {
                        if (can.isDeferred(data[prop])) {
                            dataCopy[prop] = usefulPart(objs.shift());
                        }
                    }
                }
                result = can.view.renderTo(format, renderer, dataCopy, helpers);
                deferred.resolve(result, dataCopy);
                if (callback) {
                    callback(result, dataCopy);
                }
            }, function () {
                deferred.reject.apply(deferred, arguments);
            });
            return deferred;
        } else {
            reading = can.__clearReading();
            async = isFunction(callback);
            deferred = getRenderer(view, async);
            if (reading) {
                can.__setReading(reading);
            }
            if (async) {
                response = deferred;
                deferred.then(function (renderer) {
                    callback(data ? can.view.renderTo(format, renderer, data, helpers) : renderer);
                });
            } else {
                if (deferred.state() === 'resolved' && deferred.__view_id) {
                    var currentRenderer = $view.cachedRenderers[deferred.__view_id];
                    return data ? can.view.renderTo(format, currentRenderer, data, helpers) : currentRenderer;
                } else {
                    deferred.then(function (renderer) {
                        response = data ? can.view.renderTo(format, renderer, data, helpers) : renderer;
                    });
                }
            }
            return response;
        }
    },
    registerView: function (id, text, type, def) {
        var info = typeof type === 'object' ? type : $view.types[type || $view.ext], renderer;
        if (info.fragRenderer) {
            renderer = info.fragRenderer(id, text);
        } else {
            renderer = makeRenderer(info.renderer(id, text));
        }
        def = def || new can.Deferred();
        if ($view.cache) {
            $view.cached[id] = def;
            def.__view_id = id;
            $view.cachedRenderers[id] = renderer;
        }
        return def.resolve(renderer);
    }
});
module.exports = can;

},{"../util/util.js":23}],35:[function(require,module,exports){
/*!
 * jQuery JavaScript Library v1.11.2
 * http://jquery.com/
 *
 * Includes Sizzle.js
 * http://sizzlejs.com/
 *
 * Copyright 2005, 2014 jQuery Foundation, Inc. and other contributors
 * Released under the MIT license
 * http://jquery.org/license
 *
 * Date: 2014-12-17T15:27Z
 */

(function( global, factory ) {

	if ( typeof module === "object" && typeof module.exports === "object" ) {
		// For CommonJS and CommonJS-like environments where a proper window is present,
		// execute the factory and get jQuery
		// For environments that do not inherently posses a window with a document
		// (such as Node.js), expose a jQuery-making factory as module.exports
		// This accentuates the need for the creation of a real window
		// e.g. var jQuery = require("jquery")(window);
		// See ticket #14549 for more info
		module.exports = global.document ?
			factory( global, true ) :
			function( w ) {
				if ( !w.document ) {
					throw new Error( "jQuery requires a window with a document" );
				}
				return factory( w );
			};
	} else {
		factory( global );
	}

// Pass this if window is not defined yet
}(typeof window !== "undefined" ? window : this, function( window, noGlobal ) {

// Can't do this because several apps including ASP.NET trace
// the stack via arguments.caller.callee and Firefox dies if
// you try to trace through "use strict" call chains. (#13335)
// Support: Firefox 18+
//

var deletedIds = [];

var slice = deletedIds.slice;

var concat = deletedIds.concat;

var push = deletedIds.push;

var indexOf = deletedIds.indexOf;

var class2type = {};

var toString = class2type.toString;

var hasOwn = class2type.hasOwnProperty;

var support = {};



var
	version = "1.11.2",

	// Define a local copy of jQuery
	jQuery = function( selector, context ) {
		// The jQuery object is actually just the init constructor 'enhanced'
		// Need init if jQuery is called (just allow error to be thrown if not included)
		return new jQuery.fn.init( selector, context );
	},

	// Support: Android<4.1, IE<9
	// Make sure we trim BOM and NBSP
	rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,

	// Matches dashed string for camelizing
	rmsPrefix = /^-ms-/,
	rdashAlpha = /-([\da-z])/gi,

	// Used by jQuery.camelCase as callback to replace()
	fcamelCase = function( all, letter ) {
		return letter.toUpperCase();
	};

jQuery.fn = jQuery.prototype = {
	// The current version of jQuery being used
	jquery: version,

	constructor: jQuery,

	// Start with an empty selector
	selector: "",

	// The default length of a jQuery object is 0
	length: 0,

	toArray: function() {
		return slice.call( this );
	},

	// Get the Nth element in the matched element set OR
	// Get the whole matched element set as a clean array
	get: function( num ) {
		return num != null ?

			// Return just the one element from the set
			( num < 0 ? this[ num + this.length ] : this[ num ] ) :

			// Return all the elements in a clean array
			slice.call( this );
	},

	// Take an array of elements and push it onto the stack
	// (returning the new matched element set)
	pushStack: function( elems ) {

		// Build a new jQuery matched element set
		var ret = jQuery.merge( this.constructor(), elems );

		// Add the old object onto the stack (as a reference)
		ret.prevObject = this;
		ret.context = this.context;

		// Return the newly-formed element set
		return ret;
	},

	// Execute a callback for every element in the matched set.
	// (You can seed the arguments with an array of args, but this is
	// only used internally.)
	each: function( callback, args ) {
		return jQuery.each( this, callback, args );
	},

	map: function( callback ) {
		return this.pushStack( jQuery.map(this, function( elem, i ) {
			return callback.call( elem, i, elem );
		}));
	},

	slice: function() {
		return this.pushStack( slice.apply( this, arguments ) );
	},

	first: function() {
		return this.eq( 0 );
	},

	last: function() {
		return this.eq( -1 );
	},

	eq: function( i ) {
		var len = this.length,
			j = +i + ( i < 0 ? len : 0 );
		return this.pushStack( j >= 0 && j < len ? [ this[j] ] : [] );
	},

	end: function() {
		return this.prevObject || this.constructor(null);
	},

	// For internal use only.
	// Behaves like an Array's method, not like a jQuery method.
	push: push,
	sort: deletedIds.sort,
	splice: deletedIds.splice
};

jQuery.extend = jQuery.fn.extend = function() {
	var src, copyIsArray, copy, name, options, clone,
		target = arguments[0] || {},
		i = 1,
		length = arguments.length,
		deep = false;

	// Handle a deep copy situation
	if ( typeof target === "boolean" ) {
		deep = target;

		// skip the boolean and the target
		target = arguments[ i ] || {};
		i++;
	}

	// Handle case when target is a string or something (possible in deep copy)
	if ( typeof target !== "object" && !jQuery.isFunction(target) ) {
		target = {};
	}

	// extend jQuery itself if only one argument is passed
	if ( i === length ) {
		target = this;
		i--;
	}

	for ( ; i < length; i++ ) {
		// Only deal with non-null/undefined values
		if ( (options = arguments[ i ]) != null ) {
			// Extend the base object
			for ( name in options ) {
				src = target[ name ];
				copy = options[ name ];

				// Prevent never-ending loop
				if ( target === copy ) {
					continue;
				}

				// Recurse if we're merging plain objects or arrays
				if ( deep && copy && ( jQuery.isPlainObject(copy) || (copyIsArray = jQuery.isArray(copy)) ) ) {
					if ( copyIsArray ) {
						copyIsArray = false;
						clone = src && jQuery.isArray(src) ? src : [];

					} else {
						clone = src && jQuery.isPlainObject(src) ? src : {};
					}

					// Never move original objects, clone them
					target[ name ] = jQuery.extend( deep, clone, copy );

				// Don't bring in undefined values
				} else if ( copy !== undefined ) {
					target[ name ] = copy;
				}
			}
		}
	}

	// Return the modified object
	return target;
};

jQuery.extend({
	// Unique for each copy of jQuery on the page
	expando: "jQuery" + ( version + Math.random() ).replace( /\D/g, "" ),

	// Assume jQuery is ready without the ready module
	isReady: true,

	error: function( msg ) {
		throw new Error( msg );
	},

	noop: function() {},

	// See test/unit/core.js for details concerning isFunction.
	// Since version 1.3, DOM methods and functions like alert
	// aren't supported. They return false on IE (#2968).
	isFunction: function( obj ) {
		return jQuery.type(obj) === "function";
	},

	isArray: Array.isArray || function( obj ) {
		return jQuery.type(obj) === "array";
	},

	isWindow: function( obj ) {
		/* jshint eqeqeq: false */
		return obj != null && obj == obj.window;
	},

	isNumeric: function( obj ) {
		// parseFloat NaNs numeric-cast false positives (null|true|false|"")
		// ...but misinterprets leading-number strings, particularly hex literals ("0x...")
		// subtraction forces infinities to NaN
		// adding 1 corrects loss of precision from parseFloat (#15100)
		return !jQuery.isArray( obj ) && (obj - parseFloat( obj ) + 1) >= 0;
	},

	isEmptyObject: function( obj ) {
		var name;
		for ( name in obj ) {
			return false;
		}
		return true;
	},

	isPlainObject: function( obj ) {
		var key;

		// Must be an Object.
		// Because of IE, we also have to check the presence of the constructor property.
		// Make sure that DOM nodes and window objects don't pass through, as well
		if ( !obj || jQuery.type(obj) !== "object" || obj.nodeType || jQuery.isWindow( obj ) ) {
			return false;
		}

		try {
			// Not own constructor property must be Object
			if ( obj.constructor &&
				!hasOwn.call(obj, "constructor") &&
				!hasOwn.call(obj.constructor.prototype, "isPrototypeOf") ) {
				return false;
			}
		} catch ( e ) {
			// IE8,9 Will throw exceptions on certain host objects #9897
			return false;
		}

		// Support: IE<9
		// Handle iteration over inherited properties before own properties.
		if ( support.ownLast ) {
			for ( key in obj ) {
				return hasOwn.call( obj, key );
			}
		}

		// Own properties are enumerated firstly, so to speed up,
		// if last one is own, then all properties are own.
		for ( key in obj ) {}

		return key === undefined || hasOwn.call( obj, key );
	},

	type: function( obj ) {
		if ( obj == null ) {
			return obj + "";
		}
		return typeof obj === "object" || typeof obj === "function" ?
			class2type[ toString.call(obj) ] || "object" :
			typeof obj;
	},

	// Evaluates a script in a global context
	// Workarounds based on findings by Jim Driscoll
	// http://weblogs.java.net/blog/driscoll/archive/2009/09/08/eval-javascript-global-context
	globalEval: function( data ) {
		if ( data && jQuery.trim( data ) ) {
			// We use execScript on Internet Explorer
			// We use an anonymous function so that context is window
			// rather than jQuery in Firefox
			( window.execScript || function( data ) {
				window[ "eval" ].call( window, data );
			} )( data );
		}
	},

	// Convert dashed to camelCase; used by the css and data modules
	// Microsoft forgot to hump their vendor prefix (#9572)
	camelCase: function( string ) {
		return string.replace( rmsPrefix, "ms-" ).replace( rdashAlpha, fcamelCase );
	},

	nodeName: function( elem, name ) {
		return elem.nodeName && elem.nodeName.toLowerCase() === name.toLowerCase();
	},

	// args is for internal usage only
	each: function( obj, callback, args ) {
		var value,
			i = 0,
			length = obj.length,
			isArray = isArraylike( obj );

		if ( args ) {
			if ( isArray ) {
				for ( ; i < length; i++ ) {
					value = callback.apply( obj[ i ], args );

					if ( value === false ) {
						break;
					}
				}
			} else {
				for ( i in obj ) {
					value = callback.apply( obj[ i ], args );

					if ( value === false ) {
						break;
					}
				}
			}

		// A special, fast, case for the most common use of each
		} else {
			if ( isArray ) {
				for ( ; i < length; i++ ) {
					value = callback.call( obj[ i ], i, obj[ i ] );

					if ( value === false ) {
						break;
					}
				}
			} else {
				for ( i in obj ) {
					value = callback.call( obj[ i ], i, obj[ i ] );

					if ( value === false ) {
						break;
					}
				}
			}
		}

		return obj;
	},

	// Support: Android<4.1, IE<9
	trim: function( text ) {
		return text == null ?
			"" :
			( text + "" ).replace( rtrim, "" );
	},

	// results is for internal usage only
	makeArray: function( arr, results ) {
		var ret = results || [];

		if ( arr != null ) {
			if ( isArraylike( Object(arr) ) ) {
				jQuery.merge( ret,
					typeof arr === "string" ?
					[ arr ] : arr
				);
			} else {
				push.call( ret, arr );
			}
		}

		return ret;
	},

	inArray: function( elem, arr, i ) {
		var len;

		if ( arr ) {
			if ( indexOf ) {
				return indexOf.call( arr, elem, i );
			}

			len = arr.length;
			i = i ? i < 0 ? Math.max( 0, len + i ) : i : 0;

			for ( ; i < len; i++ ) {
				// Skip accessing in sparse arrays
				if ( i in arr && arr[ i ] === elem ) {
					return i;
				}
			}
		}

		return -1;
	},

	merge: function( first, second ) {
		var len = +second.length,
			j = 0,
			i = first.length;

		while ( j < len ) {
			first[ i++ ] = second[ j++ ];
		}

		// Support: IE<9
		// Workaround casting of .length to NaN on otherwise arraylike objects (e.g., NodeLists)
		if ( len !== len ) {
			while ( second[j] !== undefined ) {
				first[ i++ ] = second[ j++ ];
			}
		}

		first.length = i;

		return first;
	},

	grep: function( elems, callback, invert ) {
		var callbackInverse,
			matches = [],
			i = 0,
			length = elems.length,
			callbackExpect = !invert;

		// Go through the array, only saving the items
		// that pass the validator function
		for ( ; i < length; i++ ) {
			callbackInverse = !callback( elems[ i ], i );
			if ( callbackInverse !== callbackExpect ) {
				matches.push( elems[ i ] );
			}
		}

		return matches;
	},

	// arg is for internal usage only
	map: function( elems, callback, arg ) {
		var value,
			i = 0,
			length = elems.length,
			isArray = isArraylike( elems ),
			ret = [];

		// Go through the array, translating each of the items to their new values
		if ( isArray ) {
			for ( ; i < length; i++ ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret.push( value );
				}
			}

		// Go through every key on the object,
		} else {
			for ( i in elems ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret.push( value );
				}
			}
		}

		// Flatten any nested arrays
		return concat.apply( [], ret );
	},

	// A global GUID counter for objects
	guid: 1,

	// Bind a function to a context, optionally partially applying any
	// arguments.
	proxy: function( fn, context ) {
		var args, proxy, tmp;

		if ( typeof context === "string" ) {
			tmp = fn[ context ];
			context = fn;
			fn = tmp;
		}

		// Quick check to determine if target is callable, in the spec
		// this throws a TypeError, but we will just return undefined.
		if ( !jQuery.isFunction( fn ) ) {
			return undefined;
		}

		// Simulated bind
		args = slice.call( arguments, 2 );
		proxy = function() {
			return fn.apply( context || this, args.concat( slice.call( arguments ) ) );
		};

		// Set the guid of unique handler to the same of original handler, so it can be removed
		proxy.guid = fn.guid = fn.guid || jQuery.guid++;

		return proxy;
	},

	now: function() {
		return +( new Date() );
	},

	// jQuery.support is not used in Core but other projects attach their
	// properties to it so it needs to exist.
	support: support
});

// Populate the class2type map
jQuery.each("Boolean Number String Function Array Date RegExp Object Error".split(" "), function(i, name) {
	class2type[ "[object " + name + "]" ] = name.toLowerCase();
});

function isArraylike( obj ) {
	var length = obj.length,
		type = jQuery.type( obj );

	if ( type === "function" || jQuery.isWindow( obj ) ) {
		return false;
	}

	if ( obj.nodeType === 1 && length ) {
		return true;
	}

	return type === "array" || length === 0 ||
		typeof length === "number" && length > 0 && ( length - 1 ) in obj;
}
var Sizzle =
/*!
 * Sizzle CSS Selector Engine v2.2.0-pre
 * http://sizzlejs.com/
 *
 * Copyright 2008, 2014 jQuery Foundation, Inc. and other contributors
 * Released under the MIT license
 * http://jquery.org/license
 *
 * Date: 2014-12-16
 */
(function( window ) {

var i,
	support,
	Expr,
	getText,
	isXML,
	tokenize,
	compile,
	select,
	outermostContext,
	sortInput,
	hasDuplicate,

	// Local document vars
	setDocument,
	document,
	docElem,
	documentIsHTML,
	rbuggyQSA,
	rbuggyMatches,
	matches,
	contains,

	// Instance-specific data
	expando = "sizzle" + 1 * new Date(),
	preferredDoc = window.document,
	dirruns = 0,
	done = 0,
	classCache = createCache(),
	tokenCache = createCache(),
	compilerCache = createCache(),
	sortOrder = function( a, b ) {
		if ( a === b ) {
			hasDuplicate = true;
		}
		return 0;
	},

	// General-purpose constants
	MAX_NEGATIVE = 1 << 31,

	// Instance methods
	hasOwn = ({}).hasOwnProperty,
	arr = [],
	pop = arr.pop,
	push_native = arr.push,
	push = arr.push,
	slice = arr.slice,
	// Use a stripped-down indexOf as it's faster than native
	// http://jsperf.com/thor-indexof-vs-for/5
	indexOf = function( list, elem ) {
		var i = 0,
			len = list.length;
		for ( ; i < len; i++ ) {
			if ( list[i] === elem ) {
				return i;
			}
		}
		return -1;
	},

	booleans = "checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",

	// Regular expressions

	// Whitespace characters http://www.w3.org/TR/css3-selectors/#whitespace
	whitespace = "[\\x20\\t\\r\\n\\f]",
	// http://www.w3.org/TR/css3-syntax/#characters
	characterEncoding = "(?:\\\\.|[\\w-]|[^\\x00-\\xa0])+",

	// Loosely modeled on CSS identifier characters
	// An unquoted value should be a CSS identifier http://www.w3.org/TR/css3-selectors/#attribute-selectors
	// Proper syntax: http://www.w3.org/TR/CSS21/syndata.html#value-def-identifier
	identifier = characterEncoding.replace( "w", "w#" ),

	// Attribute selectors: http://www.w3.org/TR/selectors/#attribute-selectors
	attributes = "\\[" + whitespace + "*(" + characterEncoding + ")(?:" + whitespace +
		// Operator (capture 2)
		"*([*^$|!~]?=)" + whitespace +
		// "Attribute values must be CSS identifiers [capture 5] or strings [capture 3 or capture 4]"
		"*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|(" + identifier + "))|)" + whitespace +
		"*\\]",

	pseudos = ":(" + characterEncoding + ")(?:\\((" +
		// To reduce the number of selectors needing tokenize in the preFilter, prefer arguments:
		// 1. quoted (capture 3; capture 4 or capture 5)
		"('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|" +
		// 2. simple (capture 6)
		"((?:\\\\.|[^\\\\()[\\]]|" + attributes + ")*)|" +
		// 3. anything else (capture 2)
		".*" +
		")\\)|)",

	// Leading and non-escaped trailing whitespace, capturing some non-whitespace characters preceding the latter
	rwhitespace = new RegExp( whitespace + "+", "g" ),
	rtrim = new RegExp( "^" + whitespace + "+|((?:^|[^\\\\])(?:\\\\.)*)" + whitespace + "+$", "g" ),

	rcomma = new RegExp( "^" + whitespace + "*," + whitespace + "*" ),
	rcombinators = new RegExp( "^" + whitespace + "*([>+~]|" + whitespace + ")" + whitespace + "*" ),

	rattributeQuotes = new RegExp( "=" + whitespace + "*([^\\]'\"]*?)" + whitespace + "*\\]", "g" ),

	rpseudo = new RegExp( pseudos ),
	ridentifier = new RegExp( "^" + identifier + "$" ),

	matchExpr = {
		"ID": new RegExp( "^#(" + characterEncoding + ")" ),
		"CLASS": new RegExp( "^\\.(" + characterEncoding + ")" ),
		"TAG": new RegExp( "^(" + characterEncoding.replace( "w", "w*" ) + ")" ),
		"ATTR": new RegExp( "^" + attributes ),
		"PSEUDO": new RegExp( "^" + pseudos ),
		"CHILD": new RegExp( "^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\(" + whitespace +
			"*(even|odd|(([+-]|)(\\d*)n|)" + whitespace + "*(?:([+-]|)" + whitespace +
			"*(\\d+)|))" + whitespace + "*\\)|)", "i" ),
		"bool": new RegExp( "^(?:" + booleans + ")$", "i" ),
		// For use in libraries implementing .is()
		// We use this for POS matching in `select`
		"needsContext": new RegExp( "^" + whitespace + "*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\(" +
			whitespace + "*((?:-\\d)?\\d*)" + whitespace + "*\\)|)(?=[^-]|$)", "i" )
	},

	rinputs = /^(?:input|select|textarea|button)$/i,
	rheader = /^h\d$/i,

	rnative = /^[^{]+\{\s*\[native \w/,

	// Easily-parseable/retrievable ID or TAG or CLASS selectors
	rquickExpr = /^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,

	rsibling = /[+~]/,
	rescape = /'|\\/g,

	// CSS escapes http://www.w3.org/TR/CSS21/syndata.html#escaped-characters
	runescape = new RegExp( "\\\\([\\da-f]{1,6}" + whitespace + "?|(" + whitespace + ")|.)", "ig" ),
	funescape = function( _, escaped, escapedWhitespace ) {
		var high = "0x" + escaped - 0x10000;
		// NaN means non-codepoint
		// Support: Firefox<24
		// Workaround erroneous numeric interpretation of +"0x"
		return high !== high || escapedWhitespace ?
			escaped :
			high < 0 ?
				// BMP codepoint
				String.fromCharCode( high + 0x10000 ) :
				// Supplemental Plane codepoint (surrogate pair)
				String.fromCharCode( high >> 10 | 0xD800, high & 0x3FF | 0xDC00 );
	},

	// Used for iframes
	// See setDocument()
	// Removing the function wrapper causes a "Permission Denied"
	// error in IE
	unloadHandler = function() {
		setDocument();
	};

// Optimize for push.apply( _, NodeList )
try {
	push.apply(
		(arr = slice.call( preferredDoc.childNodes )),
		preferredDoc.childNodes
	);
	// Support: Android<4.0
	// Detect silently failing push.apply
	arr[ preferredDoc.childNodes.length ].nodeType;
} catch ( e ) {
	push = { apply: arr.length ?

		// Leverage slice if possible
		function( target, els ) {
			push_native.apply( target, slice.call(els) );
		} :

		// Support: IE<9
		// Otherwise append directly
		function( target, els ) {
			var j = target.length,
				i = 0;
			// Can't trust NodeList.length
			while ( (target[j++] = els[i++]) ) {}
			target.length = j - 1;
		}
	};
}

function Sizzle( selector, context, results, seed ) {
	var match, elem, m, nodeType,
		// QSA vars
		i, groups, old, nid, newContext, newSelector;

	if ( ( context ? context.ownerDocument || context : preferredDoc ) !== document ) {
		setDocument( context );
	}

	context = context || document;
	results = results || [];
	nodeType = context.nodeType;

	if ( typeof selector !== "string" || !selector ||
		nodeType !== 1 && nodeType !== 9 && nodeType !== 11 ) {

		return results;
	}

	if ( !seed && documentIsHTML ) {

		// Try to shortcut find operations when possible (e.g., not under DocumentFragment)
		if ( nodeType !== 11 && (match = rquickExpr.exec( selector )) ) {
			// Speed-up: Sizzle("#ID")
			if ( (m = match[1]) ) {
				if ( nodeType === 9 ) {
					elem = context.getElementById( m );
					// Check parentNode to catch when Blackberry 4.6 returns
					// nodes that are no longer in the document (jQuery #6963)
					if ( elem && elem.parentNode ) {
						// Handle the case where IE, Opera, and Webkit return items
						// by name instead of ID
						if ( elem.id === m ) {
							results.push( elem );
							return results;
						}
					} else {
						return results;
					}
				} else {
					// Context is not a document
					if ( context.ownerDocument && (elem = context.ownerDocument.getElementById( m )) &&
						contains( context, elem ) && elem.id === m ) {
						results.push( elem );
						return results;
					}
				}

			// Speed-up: Sizzle("TAG")
			} else if ( match[2] ) {
				push.apply( results, context.getElementsByTagName( selector ) );
				return results;

			// Speed-up: Sizzle(".CLASS")
			} else if ( (m = match[3]) && support.getElementsByClassName ) {
				push.apply( results, context.getElementsByClassName( m ) );
				return results;
			}
		}

		// QSA path
		if ( support.qsa && (!rbuggyQSA || !rbuggyQSA.test( selector )) ) {
			nid = old = expando;
			newContext = context;
			newSelector = nodeType !== 1 && selector;

			// qSA works strangely on Element-rooted queries
			// We can work around this by specifying an extra ID on the root
			// and working up from there (Thanks to Andrew Dupont for the technique)
			// IE 8 doesn't work on object elements
			if ( nodeType === 1 && context.nodeName.toLowerCase() !== "object" ) {
				groups = tokenize( selector );

				if ( (old = context.getAttribute("id")) ) {
					nid = old.replace( rescape, "\\$&" );
				} else {
					context.setAttribute( "id", nid );
				}
				nid = "[id='" + nid + "'] ";

				i = groups.length;
				while ( i-- ) {
					groups[i] = nid + toSelector( groups[i] );
				}
				newContext = rsibling.test( selector ) && testContext( context.parentNode ) || context;
				newSelector = groups.join(",");
			}

			if ( newSelector ) {
				try {
					push.apply( results,
						newContext.querySelectorAll( newSelector )
					);
					return results;
				} catch(qsaError) {
				} finally {
					if ( !old ) {
						context.removeAttribute("id");
					}
				}
			}
		}
	}

	// All others
	return select( selector.replace( rtrim, "$1" ), context, results, seed );
}

/**
 * Create key-value caches of limited size
 * @returns {Function(string, Object)} Returns the Object data after storing it on itself with
 *	property name the (space-suffixed) string and (if the cache is larger than Expr.cacheLength)
 *	deleting the oldest entry
 */
function createCache() {
	var keys = [];

	function cache( key, value ) {
		// Use (key + " ") to avoid collision with native prototype properties (see Issue #157)
		if ( keys.push( key + " " ) > Expr.cacheLength ) {
			// Only keep the most recent entries
			delete cache[ keys.shift() ];
		}
		return (cache[ key + " " ] = value);
	}
	return cache;
}

/**
 * Mark a function for special use by Sizzle
 * @param {Function} fn The function to mark
 */
function markFunction( fn ) {
	fn[ expando ] = true;
	return fn;
}

/**
 * Support testing using an element
 * @param {Function} fn Passed the created div and expects a boolean result
 */
function assert( fn ) {
	var div = document.createElement("div");

	try {
		return !!fn( div );
	} catch (e) {
		return false;
	} finally {
		// Remove from its parent by default
		if ( div.parentNode ) {
			div.parentNode.removeChild( div );
		}
		// release memory in IE
		div = null;
	}
}

/**
 * Adds the same handler for all of the specified attrs
 * @param {String} attrs Pipe-separated list of attributes
 * @param {Function} handler The method that will be applied
 */
function addHandle( attrs, handler ) {
	var arr = attrs.split("|"),
		i = attrs.length;

	while ( i-- ) {
		Expr.attrHandle[ arr[i] ] = handler;
	}
}

/**
 * Checks document order of two siblings
 * @param {Element} a
 * @param {Element} b
 * @returns {Number} Returns less than 0 if a precedes b, greater than 0 if a follows b
 */
function siblingCheck( a, b ) {
	var cur = b && a,
		diff = cur && a.nodeType === 1 && b.nodeType === 1 &&
			( ~b.sourceIndex || MAX_NEGATIVE ) -
			( ~a.sourceIndex || MAX_NEGATIVE );

	// Use IE sourceIndex if available on both nodes
	if ( diff ) {
		return diff;
	}

	// Check if b follows a
	if ( cur ) {
		while ( (cur = cur.nextSibling) ) {
			if ( cur === b ) {
				return -1;
			}
		}
	}

	return a ? 1 : -1;
}

/**
 * Returns a function to use in pseudos for input types
 * @param {String} type
 */
function createInputPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return name === "input" && elem.type === type;
	};
}

/**
 * Returns a function to use in pseudos for buttons
 * @param {String} type
 */
function createButtonPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return (name === "input" || name === "button") && elem.type === type;
	};
}

/**
 * Returns a function to use in pseudos for positionals
 * @param {Function} fn
 */
function createPositionalPseudo( fn ) {
	return markFunction(function( argument ) {
		argument = +argument;
		return markFunction(function( seed, matches ) {
			var j,
				matchIndexes = fn( [], seed.length, argument ),
				i = matchIndexes.length;

			// Match elements found at the specified indexes
			while ( i-- ) {
				if ( seed[ (j = matchIndexes[i]) ] ) {
					seed[j] = !(matches[j] = seed[j]);
				}
			}
		});
	});
}

/**
 * Checks a node for validity as a Sizzle context
 * @param {Element|Object=} context
 * @returns {Element|Object|Boolean} The input node if acceptable, otherwise a falsy value
 */
function testContext( context ) {
	return context && typeof context.getElementsByTagName !== "undefined" && context;
}

// Expose support vars for convenience
support = Sizzle.support = {};

/**
 * Detects XML nodes
 * @param {Element|Object} elem An element or a document
 * @returns {Boolean} True iff elem is a non-HTML XML node
 */
isXML = Sizzle.isXML = function( elem ) {
	// documentElement is verified for cases where it doesn't yet exist
	// (such as loading iframes in IE - #4833)
	var documentElement = elem && (elem.ownerDocument || elem).documentElement;
	return documentElement ? documentElement.nodeName !== "HTML" : false;
};

/**
 * Sets document-related variables once based on the current document
 * @param {Element|Object} [doc] An element or document object to use to set the document
 * @returns {Object} Returns the current document
 */
setDocument = Sizzle.setDocument = function( node ) {
	var hasCompare, parent,
		doc = node ? node.ownerDocument || node : preferredDoc;

	// If no document and documentElement is available, return
	if ( doc === document || doc.nodeType !== 9 || !doc.documentElement ) {
		return document;
	}

	// Set our document
	document = doc;
	docElem = doc.documentElement;
	parent = doc.defaultView;

	// Support: IE>8
	// If iframe document is assigned to "document" variable and if iframe has been reloaded,
	// IE will throw "permission denied" error when accessing "document" variable, see jQuery #13936
	// IE6-8 do not support the defaultView property so parent will be undefined
	if ( parent && parent !== parent.top ) {
		// IE11 does not have attachEvent, so all must suffer
		if ( parent.addEventListener ) {
			parent.addEventListener( "unload", unloadHandler, false );
		} else if ( parent.attachEvent ) {
			parent.attachEvent( "onunload", unloadHandler );
		}
	}

	/* Support tests
	---------------------------------------------------------------------- */
	documentIsHTML = !isXML( doc );

	/* Attributes
	---------------------------------------------------------------------- */

	// Support: IE<8
	// Verify that getAttribute really returns attributes and not properties
	// (excepting IE8 booleans)
	support.attributes = assert(function( div ) {
		div.className = "i";
		return !div.getAttribute("className");
	});

	/* getElement(s)By*
	---------------------------------------------------------------------- */

	// Check if getElementsByTagName("*") returns only elements
	support.getElementsByTagName = assert(function( div ) {
		div.appendChild( doc.createComment("") );
		return !div.getElementsByTagName("*").length;
	});

	// Support: IE<9
	support.getElementsByClassName = rnative.test( doc.getElementsByClassName );

	// Support: IE<10
	// Check if getElementById returns elements by name
	// The broken getElementById methods don't pick up programatically-set names,
	// so use a roundabout getElementsByName test
	support.getById = assert(function( div ) {
		docElem.appendChild( div ).id = expando;
		return !doc.getElementsByName || !doc.getElementsByName( expando ).length;
	});

	// ID find and filter
	if ( support.getById ) {
		Expr.find["ID"] = function( id, context ) {
			if ( typeof context.getElementById !== "undefined" && documentIsHTML ) {
				var m = context.getElementById( id );
				// Check parentNode to catch when Blackberry 4.6 returns
				// nodes that are no longer in the document #6963
				return m && m.parentNode ? [ m ] : [];
			}
		};
		Expr.filter["ID"] = function( id ) {
			var attrId = id.replace( runescape, funescape );
			return function( elem ) {
				return elem.getAttribute("id") === attrId;
			};
		};
	} else {
		// Support: IE6/7
		// getElementById is not reliable as a find shortcut
		delete Expr.find["ID"];

		Expr.filter["ID"] =  function( id ) {
			var attrId = id.replace( runescape, funescape );
			return function( elem ) {
				var node = typeof elem.getAttributeNode !== "undefined" && elem.getAttributeNode("id");
				return node && node.value === attrId;
			};
		};
	}

	// Tag
	Expr.find["TAG"] = support.getElementsByTagName ?
		function( tag, context ) {
			if ( typeof context.getElementsByTagName !== "undefined" ) {
				return context.getElementsByTagName( tag );

			// DocumentFragment nodes don't have gEBTN
			} else if ( support.qsa ) {
				return context.querySelectorAll( tag );
			}
		} :

		function( tag, context ) {
			var elem,
				tmp = [],
				i = 0,
				// By happy coincidence, a (broken) gEBTN appears on DocumentFragment nodes too
				results = context.getElementsByTagName( tag );

			// Filter out possible comments
			if ( tag === "*" ) {
				while ( (elem = results[i++]) ) {
					if ( elem.nodeType === 1 ) {
						tmp.push( elem );
					}
				}

				return tmp;
			}
			return results;
		};

	// Class
	Expr.find["CLASS"] = support.getElementsByClassName && function( className, context ) {
		if ( documentIsHTML ) {
			return context.getElementsByClassName( className );
		}
	};

	/* QSA/matchesSelector
	---------------------------------------------------------------------- */

	// QSA and matchesSelector support

	// matchesSelector(:active) reports false when true (IE9/Opera 11.5)
	rbuggyMatches = [];

	// qSa(:focus) reports false when true (Chrome 21)
	// We allow this because of a bug in IE8/9 that throws an error
	// whenever `document.activeElement` is accessed on an iframe
	// So, we allow :focus to pass through QSA all the time to avoid the IE error
	// See http://bugs.jquery.com/ticket/13378
	rbuggyQSA = [];

	if ( (support.qsa = rnative.test( doc.querySelectorAll )) ) {
		// Build QSA regex
		// Regex strategy adopted from Diego Perini
		assert(function( div ) {
			// Select is set to empty string on purpose
			// This is to test IE's treatment of not explicitly
			// setting a boolean content attribute,
			// since its presence should be enough
			// http://bugs.jquery.com/ticket/12359
			docElem.appendChild( div ).innerHTML = "<a id='" + expando + "'></a>" +
				"<select id='" + expando + "-\f]' msallowcapture=''>" +
				"<option selected=''></option></select>";

			// Support: IE8, Opera 11-12.16
			// Nothing should be selected when empty strings follow ^= or $= or *=
			// The test attribute must be unknown in Opera but "safe" for WinRT
			// http://msdn.microsoft.com/en-us/library/ie/hh465388.aspx#attribute_section
			if ( div.querySelectorAll("[msallowcapture^='']").length ) {
				rbuggyQSA.push( "[*^$]=" + whitespace + "*(?:''|\"\")" );
			}

			// Support: IE8
			// Boolean attributes and "value" are not treated correctly
			if ( !div.querySelectorAll("[selected]").length ) {
				rbuggyQSA.push( "\\[" + whitespace + "*(?:value|" + booleans + ")" );
			}

			// Support: Chrome<29, Android<4.2+, Safari<7.0+, iOS<7.0+, PhantomJS<1.9.7+
			if ( !div.querySelectorAll( "[id~=" + expando + "-]" ).length ) {
				rbuggyQSA.push("~=");
			}

			// Webkit/Opera - :checked should return selected option elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			// IE8 throws error here and will not see later tests
			if ( !div.querySelectorAll(":checked").length ) {
				rbuggyQSA.push(":checked");
			}

			// Support: Safari 8+, iOS 8+
			// https://bugs.webkit.org/show_bug.cgi?id=136851
			// In-page `selector#id sibing-combinator selector` fails
			if ( !div.querySelectorAll( "a#" + expando + "+*" ).length ) {
				rbuggyQSA.push(".#.+[+~]");
			}
		});

		assert(function( div ) {
			// Support: Windows 8 Native Apps
			// The type and name attributes are restricted during .innerHTML assignment
			var input = doc.createElement("input");
			input.setAttribute( "type", "hidden" );
			div.appendChild( input ).setAttribute( "name", "D" );

			// Support: IE8
			// Enforce case-sensitivity of name attribute
			if ( div.querySelectorAll("[name=d]").length ) {
				rbuggyQSA.push( "name" + whitespace + "*[*^$|!~]?=" );
			}

			// FF 3.5 - :enabled/:disabled and hidden elements (hidden elements are still enabled)
			// IE8 throws error here and will not see later tests
			if ( !div.querySelectorAll(":enabled").length ) {
				rbuggyQSA.push( ":enabled", ":disabled" );
			}

			// Opera 10-11 does not throw on post-comma invalid pseudos
			div.querySelectorAll("*,:x");
			rbuggyQSA.push(",.*:");
		});
	}

	if ( (support.matchesSelector = rnative.test( (matches = docElem.matches ||
		docElem.webkitMatchesSelector ||
		docElem.mozMatchesSelector ||
		docElem.oMatchesSelector ||
		docElem.msMatchesSelector) )) ) {

		assert(function( div ) {
			// Check to see if it's possible to do matchesSelector
			// on a disconnected node (IE 9)
			support.disconnectedMatch = matches.call( div, "div" );

			// This should fail with an exception
			// Gecko does not error, returns false instead
			matches.call( div, "[s!='']:x" );
			rbuggyMatches.push( "!=", pseudos );
		});
	}

	rbuggyQSA = rbuggyQSA.length && new RegExp( rbuggyQSA.join("|") );
	rbuggyMatches = rbuggyMatches.length && new RegExp( rbuggyMatches.join("|") );

	/* Contains
	---------------------------------------------------------------------- */
	hasCompare = rnative.test( docElem.compareDocumentPosition );

	// Element contains another
	// Purposefully does not implement inclusive descendent
	// As in, an element does not contain itself
	contains = hasCompare || rnative.test( docElem.contains ) ?
		function( a, b ) {
			var adown = a.nodeType === 9 ? a.documentElement : a,
				bup = b && b.parentNode;
			return a === bup || !!( bup && bup.nodeType === 1 && (
				adown.contains ?
					adown.contains( bup ) :
					a.compareDocumentPosition && a.compareDocumentPosition( bup ) & 16
			));
		} :
		function( a, b ) {
			if ( b ) {
				while ( (b = b.parentNode) ) {
					if ( b === a ) {
						return true;
					}
				}
			}
			return false;
		};

	/* Sorting
	---------------------------------------------------------------------- */

	// Document order sorting
	sortOrder = hasCompare ?
	function( a, b ) {

		// Flag for duplicate removal
		if ( a === b ) {
			hasDuplicate = true;
			return 0;
		}

		// Sort on method existence if only one input has compareDocumentPosition
		var compare = !a.compareDocumentPosition - !b.compareDocumentPosition;
		if ( compare ) {
			return compare;
		}

		// Calculate position if both inputs belong to the same document
		compare = ( a.ownerDocument || a ) === ( b.ownerDocument || b ) ?
			a.compareDocumentPosition( b ) :

			// Otherwise we know they are disconnected
			1;

		// Disconnected nodes
		if ( compare & 1 ||
			(!support.sortDetached && b.compareDocumentPosition( a ) === compare) ) {

			// Choose the first element that is related to our preferred document
			if ( a === doc || a.ownerDocument === preferredDoc && contains(preferredDoc, a) ) {
				return -1;
			}
			if ( b === doc || b.ownerDocument === preferredDoc && contains(preferredDoc, b) ) {
				return 1;
			}

			// Maintain original order
			return sortInput ?
				( indexOf( sortInput, a ) - indexOf( sortInput, b ) ) :
				0;
		}

		return compare & 4 ? -1 : 1;
	} :
	function( a, b ) {
		// Exit early if the nodes are identical
		if ( a === b ) {
			hasDuplicate = true;
			return 0;
		}

		var cur,
			i = 0,
			aup = a.parentNode,
			bup = b.parentNode,
			ap = [ a ],
			bp = [ b ];

		// Parentless nodes are either documents or disconnected
		if ( !aup || !bup ) {
			return a === doc ? -1 :
				b === doc ? 1 :
				aup ? -1 :
				bup ? 1 :
				sortInput ?
				( indexOf( sortInput, a ) - indexOf( sortInput, b ) ) :
				0;

		// If the nodes are siblings, we can do a quick check
		} else if ( aup === bup ) {
			return siblingCheck( a, b );
		}

		// Otherwise we need full lists of their ancestors for comparison
		cur = a;
		while ( (cur = cur.parentNode) ) {
			ap.unshift( cur );
		}
		cur = b;
		while ( (cur = cur.parentNode) ) {
			bp.unshift( cur );
		}

		// Walk down the tree looking for a discrepancy
		while ( ap[i] === bp[i] ) {
			i++;
		}

		return i ?
			// Do a sibling check if the nodes have a common ancestor
			siblingCheck( ap[i], bp[i] ) :

			// Otherwise nodes in our document sort first
			ap[i] === preferredDoc ? -1 :
			bp[i] === preferredDoc ? 1 :
			0;
	};

	return doc;
};

Sizzle.matches = function( expr, elements ) {
	return Sizzle( expr, null, null, elements );
};

Sizzle.matchesSelector = function( elem, expr ) {
	// Set document vars if needed
	if ( ( elem.ownerDocument || elem ) !== document ) {
		setDocument( elem );
	}

	// Make sure that attribute selectors are quoted
	expr = expr.replace( rattributeQuotes, "='$1']" );

	if ( support.matchesSelector && documentIsHTML &&
		( !rbuggyMatches || !rbuggyMatches.test( expr ) ) &&
		( !rbuggyQSA     || !rbuggyQSA.test( expr ) ) ) {

		try {
			var ret = matches.call( elem, expr );

			// IE 9's matchesSelector returns false on disconnected nodes
			if ( ret || support.disconnectedMatch ||
					// As well, disconnected nodes are said to be in a document
					// fragment in IE 9
					elem.document && elem.document.nodeType !== 11 ) {
				return ret;
			}
		} catch (e) {}
	}

	return Sizzle( expr, document, null, [ elem ] ).length > 0;
};

Sizzle.contains = function( context, elem ) {
	// Set document vars if needed
	if ( ( context.ownerDocument || context ) !== document ) {
		setDocument( context );
	}
	return contains( context, elem );
};

Sizzle.attr = function( elem, name ) {
	// Set document vars if needed
	if ( ( elem.ownerDocument || elem ) !== document ) {
		setDocument( elem );
	}

	var fn = Expr.attrHandle[ name.toLowerCase() ],
		// Don't get fooled by Object.prototype properties (jQuery #13807)
		val = fn && hasOwn.call( Expr.attrHandle, name.toLowerCase() ) ?
			fn( elem, name, !documentIsHTML ) :
			undefined;

	return val !== undefined ?
		val :
		support.attributes || !documentIsHTML ?
			elem.getAttribute( name ) :
			(val = elem.getAttributeNode(name)) && val.specified ?
				val.value :
				null;
};

Sizzle.error = function( msg ) {
	throw new Error( "Syntax error, unrecognized expression: " + msg );
};

/**
 * Document sorting and removing duplicates
 * @param {ArrayLike} results
 */
Sizzle.uniqueSort = function( results ) {
	var elem,
		duplicates = [],
		j = 0,
		i = 0;

	// Unless we *know* we can detect duplicates, assume their presence
	hasDuplicate = !support.detectDuplicates;
	sortInput = !support.sortStable && results.slice( 0 );
	results.sort( sortOrder );

	if ( hasDuplicate ) {
		while ( (elem = results[i++]) ) {
			if ( elem === results[ i ] ) {
				j = duplicates.push( i );
			}
		}
		while ( j-- ) {
			results.splice( duplicates[ j ], 1 );
		}
	}

	// Clear input after sorting to release objects
	// See https://github.com/jquery/sizzle/pull/225
	sortInput = null;

	return results;
};

/**
 * Utility function for retrieving the text value of an array of DOM nodes
 * @param {Array|Element} elem
 */
getText = Sizzle.getText = function( elem ) {
	var node,
		ret = "",
		i = 0,
		nodeType = elem.nodeType;

	if ( !nodeType ) {
		// If no nodeType, this is expected to be an array
		while ( (node = elem[i++]) ) {
			// Do not traverse comment nodes
			ret += getText( node );
		}
	} else if ( nodeType === 1 || nodeType === 9 || nodeType === 11 ) {
		// Use textContent for elements
		// innerText usage removed for consistency of new lines (jQuery #11153)
		if ( typeof elem.textContent === "string" ) {
			return elem.textContent;
		} else {
			// Traverse its children
			for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
				ret += getText( elem );
			}
		}
	} else if ( nodeType === 3 || nodeType === 4 ) {
		return elem.nodeValue;
	}
	// Do not include comment or processing instruction nodes

	return ret;
};

Expr = Sizzle.selectors = {

	// Can be adjusted by the user
	cacheLength: 50,

	createPseudo: markFunction,

	match: matchExpr,

	attrHandle: {},

	find: {},

	relative: {
		">": { dir: "parentNode", first: true },
		" ": { dir: "parentNode" },
		"+": { dir: "previousSibling", first: true },
		"~": { dir: "previousSibling" }
	},

	preFilter: {
		"ATTR": function( match ) {
			match[1] = match[1].replace( runescape, funescape );

			// Move the given value to match[3] whether quoted or unquoted
			match[3] = ( match[3] || match[4] || match[5] || "" ).replace( runescape, funescape );

			if ( match[2] === "~=" ) {
				match[3] = " " + match[3] + " ";
			}

			return match.slice( 0, 4 );
		},

		"CHILD": function( match ) {
			/* matches from matchExpr["CHILD"]
				1 type (only|nth|...)
				2 what (child|of-type)
				3 argument (even|odd|\d*|\d*n([+-]\d+)?|...)
				4 xn-component of xn+y argument ([+-]?\d*n|)
				5 sign of xn-component
				6 x of xn-component
				7 sign of y-component
				8 y of y-component
			*/
			match[1] = match[1].toLowerCase();

			if ( match[1].slice( 0, 3 ) === "nth" ) {
				// nth-* requires argument
				if ( !match[3] ) {
					Sizzle.error( match[0] );
				}

				// numeric x and y parameters for Expr.filter.CHILD
				// remember that false/true cast respectively to 0/1
				match[4] = +( match[4] ? match[5] + (match[6] || 1) : 2 * ( match[3] === "even" || match[3] === "odd" ) );
				match[5] = +( ( match[7] + match[8] ) || match[3] === "odd" );

			// other types prohibit arguments
			} else if ( match[3] ) {
				Sizzle.error( match[0] );
			}

			return match;
		},

		"PSEUDO": function( match ) {
			var excess,
				unquoted = !match[6] && match[2];

			if ( matchExpr["CHILD"].test( match[0] ) ) {
				return null;
			}

			// Accept quoted arguments as-is
			if ( match[3] ) {
				match[2] = match[4] || match[5] || "";

			// Strip excess characters from unquoted arguments
			} else if ( unquoted && rpseudo.test( unquoted ) &&
				// Get excess from tokenize (recursively)
				(excess = tokenize( unquoted, true )) &&
				// advance to the next closing parenthesis
				(excess = unquoted.indexOf( ")", unquoted.length - excess ) - unquoted.length) ) {

				// excess is a negative index
				match[0] = match[0].slice( 0, excess );
				match[2] = unquoted.slice( 0, excess );
			}

			// Return only captures needed by the pseudo filter method (type and argument)
			return match.slice( 0, 3 );
		}
	},

	filter: {

		"TAG": function( nodeNameSelector ) {
			var nodeName = nodeNameSelector.replace( runescape, funescape ).toLowerCase();
			return nodeNameSelector === "*" ?
				function() { return true; } :
				function( elem ) {
					return elem.nodeName && elem.nodeName.toLowerCase() === nodeName;
				};
		},

		"CLASS": function( className ) {
			var pattern = classCache[ className + " " ];

			return pattern ||
				(pattern = new RegExp( "(^|" + whitespace + ")" + className + "(" + whitespace + "|$)" )) &&
				classCache( className, function( elem ) {
					return pattern.test( typeof elem.className === "string" && elem.className || typeof elem.getAttribute !== "undefined" && elem.getAttribute("class") || "" );
				});
		},

		"ATTR": function( name, operator, check ) {
			return function( elem ) {
				var result = Sizzle.attr( elem, name );

				if ( result == null ) {
					return operator === "!=";
				}
				if ( !operator ) {
					return true;
				}

				result += "";

				return operator === "=" ? result === check :
					operator === "!=" ? result !== check :
					operator === "^=" ? check && result.indexOf( check ) === 0 :
					operator === "*=" ? check && result.indexOf( check ) > -1 :
					operator === "$=" ? check && result.slice( -check.length ) === check :
					operator === "~=" ? ( " " + result.replace( rwhitespace, " " ) + " " ).indexOf( check ) > -1 :
					operator === "|=" ? result === check || result.slice( 0, check.length + 1 ) === check + "-" :
					false;
			};
		},

		"CHILD": function( type, what, argument, first, last ) {
			var simple = type.slice( 0, 3 ) !== "nth",
				forward = type.slice( -4 ) !== "last",
				ofType = what === "of-type";

			return first === 1 && last === 0 ?

				// Shortcut for :nth-*(n)
				function( elem ) {
					return !!elem.parentNode;
				} :

				function( elem, context, xml ) {
					var cache, outerCache, node, diff, nodeIndex, start,
						dir = simple !== forward ? "nextSibling" : "previousSibling",
						parent = elem.parentNode,
						name = ofType && elem.nodeName.toLowerCase(),
						useCache = !xml && !ofType;

					if ( parent ) {

						// :(first|last|only)-(child|of-type)
						if ( simple ) {
							while ( dir ) {
								node = elem;
								while ( (node = node[ dir ]) ) {
									if ( ofType ? node.nodeName.toLowerCase() === name : node.nodeType === 1 ) {
										return false;
									}
								}
								// Reverse direction for :only-* (if we haven't yet done so)
								start = dir = type === "only" && !start && "nextSibling";
							}
							return true;
						}

						start = [ forward ? parent.firstChild : parent.lastChild ];

						// non-xml :nth-child(...) stores cache data on `parent`
						if ( forward && useCache ) {
							// Seek `elem` from a previously-cached index
							outerCache = parent[ expando ] || (parent[ expando ] = {});
							cache = outerCache[ type ] || [];
							nodeIndex = cache[0] === dirruns && cache[1];
							diff = cache[0] === dirruns && cache[2];
							node = nodeIndex && parent.childNodes[ nodeIndex ];

							while ( (node = ++nodeIndex && node && node[ dir ] ||

								// Fallback to seeking `elem` from the start
								(diff = nodeIndex = 0) || start.pop()) ) {

								// When found, cache indexes on `parent` and break
								if ( node.nodeType === 1 && ++diff && node === elem ) {
									outerCache[ type ] = [ dirruns, nodeIndex, diff ];
									break;
								}
							}

						// Use previously-cached element index if available
						} else if ( useCache && (cache = (elem[ expando ] || (elem[ expando ] = {}))[ type ]) && cache[0] === dirruns ) {
							diff = cache[1];

						// xml :nth-child(...) or :nth-last-child(...) or :nth(-last)?-of-type(...)
						} else {
							// Use the same loop as above to seek `elem` from the start
							while ( (node = ++nodeIndex && node && node[ dir ] ||
								(diff = nodeIndex = 0) || start.pop()) ) {

								if ( ( ofType ? node.nodeName.toLowerCase() === name : node.nodeType === 1 ) && ++diff ) {
									// Cache the index of each encountered element
									if ( useCache ) {
										(node[ expando ] || (node[ expando ] = {}))[ type ] = [ dirruns, diff ];
									}

									if ( node === elem ) {
										break;
									}
								}
							}
						}

						// Incorporate the offset, then check against cycle size
						diff -= last;
						return diff === first || ( diff % first === 0 && diff / first >= 0 );
					}
				};
		},

		"PSEUDO": function( pseudo, argument ) {
			// pseudo-class names are case-insensitive
			// http://www.w3.org/TR/selectors/#pseudo-classes
			// Prioritize by case sensitivity in case custom pseudos are added with uppercase letters
			// Remember that setFilters inherits from pseudos
			var args,
				fn = Expr.pseudos[ pseudo ] || Expr.setFilters[ pseudo.toLowerCase() ] ||
					Sizzle.error( "unsupported pseudo: " + pseudo );

			// The user may use createPseudo to indicate that
			// arguments are needed to create the filter function
			// just as Sizzle does
			if ( fn[ expando ] ) {
				return fn( argument );
			}

			// But maintain support for old signatures
			if ( fn.length > 1 ) {
				args = [ pseudo, pseudo, "", argument ];
				return Expr.setFilters.hasOwnProperty( pseudo.toLowerCase() ) ?
					markFunction(function( seed, matches ) {
						var idx,
							matched = fn( seed, argument ),
							i = matched.length;
						while ( i-- ) {
							idx = indexOf( seed, matched[i] );
							seed[ idx ] = !( matches[ idx ] = matched[i] );
						}
					}) :
					function( elem ) {
						return fn( elem, 0, args );
					};
			}

			return fn;
		}
	},

	pseudos: {
		// Potentially complex pseudos
		"not": markFunction(function( selector ) {
			// Trim the selector passed to compile
			// to avoid treating leading and trailing
			// spaces as combinators
			var input = [],
				results = [],
				matcher = compile( selector.replace( rtrim, "$1" ) );

			return matcher[ expando ] ?
				markFunction(function( seed, matches, context, xml ) {
					var elem,
						unmatched = matcher( seed, null, xml, [] ),
						i = seed.length;

					// Match elements unmatched by `matcher`
					while ( i-- ) {
						if ( (elem = unmatched[i]) ) {
							seed[i] = !(matches[i] = elem);
						}
					}
				}) :
				function( elem, context, xml ) {
					input[0] = elem;
					matcher( input, null, xml, results );
					// Don't keep the element (issue #299)
					input[0] = null;
					return !results.pop();
				};
		}),

		"has": markFunction(function( selector ) {
			return function( elem ) {
				return Sizzle( selector, elem ).length > 0;
			};
		}),

		"contains": markFunction(function( text ) {
			text = text.replace( runescape, funescape );
			return function( elem ) {
				return ( elem.textContent || elem.innerText || getText( elem ) ).indexOf( text ) > -1;
			};
		}),

		// "Whether an element is represented by a :lang() selector
		// is based solely on the element's language value
		// being equal to the identifier C,
		// or beginning with the identifier C immediately followed by "-".
		// The matching of C against the element's language value is performed case-insensitively.
		// The identifier C does not have to be a valid language name."
		// http://www.w3.org/TR/selectors/#lang-pseudo
		"lang": markFunction( function( lang ) {
			// lang value must be a valid identifier
			if ( !ridentifier.test(lang || "") ) {
				Sizzle.error( "unsupported lang: " + lang );
			}
			lang = lang.replace( runescape, funescape ).toLowerCase();
			return function( elem ) {
				var elemLang;
				do {
					if ( (elemLang = documentIsHTML ?
						elem.lang :
						elem.getAttribute("xml:lang") || elem.getAttribute("lang")) ) {

						elemLang = elemLang.toLowerCase();
						return elemLang === lang || elemLang.indexOf( lang + "-" ) === 0;
					}
				} while ( (elem = elem.parentNode) && elem.nodeType === 1 );
				return false;
			};
		}),

		// Miscellaneous
		"target": function( elem ) {
			var hash = window.location && window.location.hash;
			return hash && hash.slice( 1 ) === elem.id;
		},

		"root": function( elem ) {
			return elem === docElem;
		},

		"focus": function( elem ) {
			return elem === document.activeElement && (!document.hasFocus || document.hasFocus()) && !!(elem.type || elem.href || ~elem.tabIndex);
		},

		// Boolean properties
		"enabled": function( elem ) {
			return elem.disabled === false;
		},

		"disabled": function( elem ) {
			return elem.disabled === true;
		},

		"checked": function( elem ) {
			// In CSS3, :checked should return both checked and selected elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			var nodeName = elem.nodeName.toLowerCase();
			return (nodeName === "input" && !!elem.checked) || (nodeName === "option" && !!elem.selected);
		},

		"selected": function( elem ) {
			// Accessing this property makes selected-by-default
			// options in Safari work properly
			if ( elem.parentNode ) {
				elem.parentNode.selectedIndex;
			}

			return elem.selected === true;
		},

		// Contents
		"empty": function( elem ) {
			// http://www.w3.org/TR/selectors/#empty-pseudo
			// :empty is negated by element (1) or content nodes (text: 3; cdata: 4; entity ref: 5),
			//   but not by others (comment: 8; processing instruction: 7; etc.)
			// nodeType < 6 works because attributes (2) do not appear as children
			for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
				if ( elem.nodeType < 6 ) {
					return false;
				}
			}
			return true;
		},

		"parent": function( elem ) {
			return !Expr.pseudos["empty"]( elem );
		},

		// Element/input types
		"header": function( elem ) {
			return rheader.test( elem.nodeName );
		},

		"input": function( elem ) {
			return rinputs.test( elem.nodeName );
		},

		"button": function( elem ) {
			var name = elem.nodeName.toLowerCase();
			return name === "input" && elem.type === "button" || name === "button";
		},

		"text": function( elem ) {
			var attr;
			return elem.nodeName.toLowerCase() === "input" &&
				elem.type === "text" &&

				// Support: IE<8
				// New HTML5 attribute values (e.g., "search") appear with elem.type === "text"
				( (attr = elem.getAttribute("type")) == null || attr.toLowerCase() === "text" );
		},

		// Position-in-collection
		"first": createPositionalPseudo(function() {
			return [ 0 ];
		}),

		"last": createPositionalPseudo(function( matchIndexes, length ) {
			return [ length - 1 ];
		}),

		"eq": createPositionalPseudo(function( matchIndexes, length, argument ) {
			return [ argument < 0 ? argument + length : argument ];
		}),

		"even": createPositionalPseudo(function( matchIndexes, length ) {
			var i = 0;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"odd": createPositionalPseudo(function( matchIndexes, length ) {
			var i = 1;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"lt": createPositionalPseudo(function( matchIndexes, length, argument ) {
			var i = argument < 0 ? argument + length : argument;
			for ( ; --i >= 0; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"gt": createPositionalPseudo(function( matchIndexes, length, argument ) {
			var i = argument < 0 ? argument + length : argument;
			for ( ; ++i < length; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		})
	}
};

Expr.pseudos["nth"] = Expr.pseudos["eq"];

// Add button/input type pseudos
for ( i in { radio: true, checkbox: true, file: true, password: true, image: true } ) {
	Expr.pseudos[ i ] = createInputPseudo( i );
}
for ( i in { submit: true, reset: true } ) {
	Expr.pseudos[ i ] = createButtonPseudo( i );
}

// Easy API for creating new setFilters
function setFilters() {}
setFilters.prototype = Expr.filters = Expr.pseudos;
Expr.setFilters = new setFilters();

tokenize = Sizzle.tokenize = function( selector, parseOnly ) {
	var matched, match, tokens, type,
		soFar, groups, preFilters,
		cached = tokenCache[ selector + " " ];

	if ( cached ) {
		return parseOnly ? 0 : cached.slice( 0 );
	}

	soFar = selector;
	groups = [];
	preFilters = Expr.preFilter;

	while ( soFar ) {

		// Comma and first run
		if ( !matched || (match = rcomma.exec( soFar )) ) {
			if ( match ) {
				// Don't consume trailing commas as valid
				soFar = soFar.slice( match[0].length ) || soFar;
			}
			groups.push( (tokens = []) );
		}

		matched = false;

		// Combinators
		if ( (match = rcombinators.exec( soFar )) ) {
			matched = match.shift();
			tokens.push({
				value: matched,
				// Cast descendant combinators to space
				type: match[0].replace( rtrim, " " )
			});
			soFar = soFar.slice( matched.length );
		}

		// Filters
		for ( type in Expr.filter ) {
			if ( (match = matchExpr[ type ].exec( soFar )) && (!preFilters[ type ] ||
				(match = preFilters[ type ]( match ))) ) {
				matched = match.shift();
				tokens.push({
					value: matched,
					type: type,
					matches: match
				});
				soFar = soFar.slice( matched.length );
			}
		}

		if ( !matched ) {
			break;
		}
	}

	// Return the length of the invalid excess
	// if we're just parsing
	// Otherwise, throw an error or return tokens
	return parseOnly ?
		soFar.length :
		soFar ?
			Sizzle.error( selector ) :
			// Cache the tokens
			tokenCache( selector, groups ).slice( 0 );
};

function toSelector( tokens ) {
	var i = 0,
		len = tokens.length,
		selector = "";
	for ( ; i < len; i++ ) {
		selector += tokens[i].value;
	}
	return selector;
}

function addCombinator( matcher, combinator, base ) {
	var dir = combinator.dir,
		checkNonElements = base && dir === "parentNode",
		doneName = done++;

	return combinator.first ?
		// Check against closest ancestor/preceding element
		function( elem, context, xml ) {
			while ( (elem = elem[ dir ]) ) {
				if ( elem.nodeType === 1 || checkNonElements ) {
					return matcher( elem, context, xml );
				}
			}
		} :

		// Check against all ancestor/preceding elements
		function( elem, context, xml ) {
			var oldCache, outerCache,
				newCache = [ dirruns, doneName ];

			// We can't set arbitrary data on XML nodes, so they don't benefit from dir caching
			if ( xml ) {
				while ( (elem = elem[ dir ]) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						if ( matcher( elem, context, xml ) ) {
							return true;
						}
					}
				}
			} else {
				while ( (elem = elem[ dir ]) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						outerCache = elem[ expando ] || (elem[ expando ] = {});
						if ( (oldCache = outerCache[ dir ]) &&
							oldCache[ 0 ] === dirruns && oldCache[ 1 ] === doneName ) {

							// Assign to newCache so results back-propagate to previous elements
							return (newCache[ 2 ] = oldCache[ 2 ]);
						} else {
							// Reuse newcache so results back-propagate to previous elements
							outerCache[ dir ] = newCache;

							// A match means we're done; a fail means we have to keep checking
							if ( (newCache[ 2 ] = matcher( elem, context, xml )) ) {
								return true;
							}
						}
					}
				}
			}
		};
}

function elementMatcher( matchers ) {
	return matchers.length > 1 ?
		function( elem, context, xml ) {
			var i = matchers.length;
			while ( i-- ) {
				if ( !matchers[i]( elem, context, xml ) ) {
					return false;
				}
			}
			return true;
		} :
		matchers[0];
}

function multipleContexts( selector, contexts, results ) {
	var i = 0,
		len = contexts.length;
	for ( ; i < len; i++ ) {
		Sizzle( selector, contexts[i], results );
	}
	return results;
}

function condense( unmatched, map, filter, context, xml ) {
	var elem,
		newUnmatched = [],
		i = 0,
		len = unmatched.length,
		mapped = map != null;

	for ( ; i < len; i++ ) {
		if ( (elem = unmatched[i]) ) {
			if ( !filter || filter( elem, context, xml ) ) {
				newUnmatched.push( elem );
				if ( mapped ) {
					map.push( i );
				}
			}
		}
	}

	return newUnmatched;
}

function setMatcher( preFilter, selector, matcher, postFilter, postFinder, postSelector ) {
	if ( postFilter && !postFilter[ expando ] ) {
		postFilter = setMatcher( postFilter );
	}
	if ( postFinder && !postFinder[ expando ] ) {
		postFinder = setMatcher( postFinder, postSelector );
	}
	return markFunction(function( seed, results, context, xml ) {
		var temp, i, elem,
			preMap = [],
			postMap = [],
			preexisting = results.length,

			// Get initial elements from seed or context
			elems = seed || multipleContexts( selector || "*", context.nodeType ? [ context ] : context, [] ),

			// Prefilter to get matcher input, preserving a map for seed-results synchronization
			matcherIn = preFilter && ( seed || !selector ) ?
				condense( elems, preMap, preFilter, context, xml ) :
				elems,

			matcherOut = matcher ?
				// If we have a postFinder, or filtered seed, or non-seed postFilter or preexisting results,
				postFinder || ( seed ? preFilter : preexisting || postFilter ) ?

					// ...intermediate processing is necessary
					[] :

					// ...otherwise use results directly
					results :
				matcherIn;

		// Find primary matches
		if ( matcher ) {
			matcher( matcherIn, matcherOut, context, xml );
		}

		// Apply postFilter
		if ( postFilter ) {
			temp = condense( matcherOut, postMap );
			postFilter( temp, [], context, xml );

			// Un-match failing elements by moving them back to matcherIn
			i = temp.length;
			while ( i-- ) {
				if ( (elem = temp[i]) ) {
					matcherOut[ postMap[i] ] = !(matcherIn[ postMap[i] ] = elem);
				}
			}
		}

		if ( seed ) {
			if ( postFinder || preFilter ) {
				if ( postFinder ) {
					// Get the final matcherOut by condensing this intermediate into postFinder contexts
					temp = [];
					i = matcherOut.length;
					while ( i-- ) {
						if ( (elem = matcherOut[i]) ) {
							// Restore matcherIn since elem is not yet a final match
							temp.push( (matcherIn[i] = elem) );
						}
					}
					postFinder( null, (matcherOut = []), temp, xml );
				}

				// Move matched elements from seed to results to keep them synchronized
				i = matcherOut.length;
				while ( i-- ) {
					if ( (elem = matcherOut[i]) &&
						(temp = postFinder ? indexOf( seed, elem ) : preMap[i]) > -1 ) {

						seed[temp] = !(results[temp] = elem);
					}
				}
			}

		// Add elements to results, through postFinder if defined
		} else {
			matcherOut = condense(
				matcherOut === results ?
					matcherOut.splice( preexisting, matcherOut.length ) :
					matcherOut
			);
			if ( postFinder ) {
				postFinder( null, results, matcherOut, xml );
			} else {
				push.apply( results, matcherOut );
			}
		}
	});
}

function matcherFromTokens( tokens ) {
	var checkContext, matcher, j,
		len = tokens.length,
		leadingRelative = Expr.relative[ tokens[0].type ],
		implicitRelative = leadingRelative || Expr.relative[" "],
		i = leadingRelative ? 1 : 0,

		// The foundational matcher ensures that elements are reachable from top-level context(s)
		matchContext = addCombinator( function( elem ) {
			return elem === checkContext;
		}, implicitRelative, true ),
		matchAnyContext = addCombinator( function( elem ) {
			return indexOf( checkContext, elem ) > -1;
		}, implicitRelative, true ),
		matchers = [ function( elem, context, xml ) {
			var ret = ( !leadingRelative && ( xml || context !== outermostContext ) ) || (
				(checkContext = context).nodeType ?
					matchContext( elem, context, xml ) :
					matchAnyContext( elem, context, xml ) );
			// Avoid hanging onto element (issue #299)
			checkContext = null;
			return ret;
		} ];

	for ( ; i < len; i++ ) {
		if ( (matcher = Expr.relative[ tokens[i].type ]) ) {
			matchers = [ addCombinator(elementMatcher( matchers ), matcher) ];
		} else {
			matcher = Expr.filter[ tokens[i].type ].apply( null, tokens[i].matches );

			// Return special upon seeing a positional matcher
			if ( matcher[ expando ] ) {
				// Find the next relative operator (if any) for proper handling
				j = ++i;
				for ( ; j < len; j++ ) {
					if ( Expr.relative[ tokens[j].type ] ) {
						break;
					}
				}
				return setMatcher(
					i > 1 && elementMatcher( matchers ),
					i > 1 && toSelector(
						// If the preceding token was a descendant combinator, insert an implicit any-element `*`
						tokens.slice( 0, i - 1 ).concat({ value: tokens[ i - 2 ].type === " " ? "*" : "" })
					).replace( rtrim, "$1" ),
					matcher,
					i < j && matcherFromTokens( tokens.slice( i, j ) ),
					j < len && matcherFromTokens( (tokens = tokens.slice( j )) ),
					j < len && toSelector( tokens )
				);
			}
			matchers.push( matcher );
		}
	}

	return elementMatcher( matchers );
}

function matcherFromGroupMatchers( elementMatchers, setMatchers ) {
	var bySet = setMatchers.length > 0,
		byElement = elementMatchers.length > 0,
		superMatcher = function( seed, context, xml, results, outermost ) {
			var elem, j, matcher,
				matchedCount = 0,
				i = "0",
				unmatched = seed && [],
				setMatched = [],
				contextBackup = outermostContext,
				// We must always have either seed elements or outermost context
				elems = seed || byElement && Expr.find["TAG"]( "*", outermost ),
				// Use integer dirruns iff this is the outermost matcher
				dirrunsUnique = (dirruns += contextBackup == null ? 1 : Math.random() || 0.1),
				len = elems.length;

			if ( outermost ) {
				outermostContext = context !== document && context;
			}

			// Add elements passing elementMatchers directly to results
			// Keep `i` a string if there are no elements so `matchedCount` will be "00" below
			// Support: IE<9, Safari
			// Tolerate NodeList properties (IE: "length"; Safari: <number>) matching elements by id
			for ( ; i !== len && (elem = elems[i]) != null; i++ ) {
				if ( byElement && elem ) {
					j = 0;
					while ( (matcher = elementMatchers[j++]) ) {
						if ( matcher( elem, context, xml ) ) {
							results.push( elem );
							break;
						}
					}
					if ( outermost ) {
						dirruns = dirrunsUnique;
					}
				}

				// Track unmatched elements for set filters
				if ( bySet ) {
					// They will have gone through all possible matchers
					if ( (elem = !matcher && elem) ) {
						matchedCount--;
					}

					// Lengthen the array for every element, matched or not
					if ( seed ) {
						unmatched.push( elem );
					}
				}
			}

			// Apply set filters to unmatched elements
			matchedCount += i;
			if ( bySet && i !== matchedCount ) {
				j = 0;
				while ( (matcher = setMatchers[j++]) ) {
					matcher( unmatched, setMatched, context, xml );
				}

				if ( seed ) {
					// Reintegrate element matches to eliminate the need for sorting
					if ( matchedCount > 0 ) {
						while ( i-- ) {
							if ( !(unmatched[i] || setMatched[i]) ) {
								setMatched[i] = pop.call( results );
							}
						}
					}

					// Discard index placeholder values to get only actual matches
					setMatched = condense( setMatched );
				}

				// Add matches to results
				push.apply( results, setMatched );

				// Seedless set matches succeeding multiple successful matchers stipulate sorting
				if ( outermost && !seed && setMatched.length > 0 &&
					( matchedCount + setMatchers.length ) > 1 ) {

					Sizzle.uniqueSort( results );
				}
			}

			// Override manipulation of globals by nested matchers
			if ( outermost ) {
				dirruns = dirrunsUnique;
				outermostContext = contextBackup;
			}

			return unmatched;
		};

	return bySet ?
		markFunction( superMatcher ) :
		superMatcher;
}

compile = Sizzle.compile = function( selector, match /* Internal Use Only */ ) {
	var i,
		setMatchers = [],
		elementMatchers = [],
		cached = compilerCache[ selector + " " ];

	if ( !cached ) {
		// Generate a function of recursive functions that can be used to check each element
		if ( !match ) {
			match = tokenize( selector );
		}
		i = match.length;
		while ( i-- ) {
			cached = matcherFromTokens( match[i] );
			if ( cached[ expando ] ) {
				setMatchers.push( cached );
			} else {
				elementMatchers.push( cached );
			}
		}

		// Cache the compiled function
		cached = compilerCache( selector, matcherFromGroupMatchers( elementMatchers, setMatchers ) );

		// Save selector and tokenization
		cached.selector = selector;
	}
	return cached;
};

/**
 * A low-level selection function that works with Sizzle's compiled
 *  selector functions
 * @param {String|Function} selector A selector or a pre-compiled
 *  selector function built with Sizzle.compile
 * @param {Element} context
 * @param {Array} [results]
 * @param {Array} [seed] A set of elements to match against
 */
select = Sizzle.select = function( selector, context, results, seed ) {
	var i, tokens, token, type, find,
		compiled = typeof selector === "function" && selector,
		match = !seed && tokenize( (selector = compiled.selector || selector) );

	results = results || [];

	// Try to minimize operations if there is no seed and only one group
	if ( match.length === 1 ) {

		// Take a shortcut and set the context if the root selector is an ID
		tokens = match[0] = match[0].slice( 0 );
		if ( tokens.length > 2 && (token = tokens[0]).type === "ID" &&
				support.getById && context.nodeType === 9 && documentIsHTML &&
				Expr.relative[ tokens[1].type ] ) {

			context = ( Expr.find["ID"]( token.matches[0].replace(runescape, funescape), context ) || [] )[0];
			if ( !context ) {
				return results;

			// Precompiled matchers will still verify ancestry, so step up a level
			} else if ( compiled ) {
				context = context.parentNode;
			}

			selector = selector.slice( tokens.shift().value.length );
		}

		// Fetch a seed set for right-to-left matching
		i = matchExpr["needsContext"].test( selector ) ? 0 : tokens.length;
		while ( i-- ) {
			token = tokens[i];

			// Abort if we hit a combinator
			if ( Expr.relative[ (type = token.type) ] ) {
				break;
			}
			if ( (find = Expr.find[ type ]) ) {
				// Search, expanding context for leading sibling combinators
				if ( (seed = find(
					token.matches[0].replace( runescape, funescape ),
					rsibling.test( tokens[0].type ) && testContext( context.parentNode ) || context
				)) ) {

					// If seed is empty or no tokens remain, we can return early
					tokens.splice( i, 1 );
					selector = seed.length && toSelector( tokens );
					if ( !selector ) {
						push.apply( results, seed );
						return results;
					}

					break;
				}
			}
		}
	}

	// Compile and execute a filtering function if one is not provided
	// Provide `match` to avoid retokenization if we modified the selector above
	( compiled || compile( selector, match ) )(
		seed,
		context,
		!documentIsHTML,
		results,
		rsibling.test( selector ) && testContext( context.parentNode ) || context
	);
	return results;
};

// One-time assignments

// Sort stability
support.sortStable = expando.split("").sort( sortOrder ).join("") === expando;

// Support: Chrome 14-35+
// Always assume duplicates if they aren't passed to the comparison function
support.detectDuplicates = !!hasDuplicate;

// Initialize against the default document
setDocument();

// Support: Webkit<537.32 - Safari 6.0.3/Chrome 25 (fixed in Chrome 27)
// Detached nodes confoundingly follow *each other*
support.sortDetached = assert(function( div1 ) {
	// Should return 1, but returns 4 (following)
	return div1.compareDocumentPosition( document.createElement("div") ) & 1;
});

// Support: IE<8
// Prevent attribute/property "interpolation"
// http://msdn.microsoft.com/en-us/library/ms536429%28VS.85%29.aspx
if ( !assert(function( div ) {
	div.innerHTML = "<a href='#'></a>";
	return div.firstChild.getAttribute("href") === "#" ;
}) ) {
	addHandle( "type|href|height|width", function( elem, name, isXML ) {
		if ( !isXML ) {
			return elem.getAttribute( name, name.toLowerCase() === "type" ? 1 : 2 );
		}
	});
}

// Support: IE<9
// Use defaultValue in place of getAttribute("value")
if ( !support.attributes || !assert(function( div ) {
	div.innerHTML = "<input/>";
	div.firstChild.setAttribute( "value", "" );
	return div.firstChild.getAttribute( "value" ) === "";
}) ) {
	addHandle( "value", function( elem, name, isXML ) {
		if ( !isXML && elem.nodeName.toLowerCase() === "input" ) {
			return elem.defaultValue;
		}
	});
}

// Support: IE<9
// Use getAttributeNode to fetch booleans when getAttribute lies
if ( !assert(function( div ) {
	return div.getAttribute("disabled") == null;
}) ) {
	addHandle( booleans, function( elem, name, isXML ) {
		var val;
		if ( !isXML ) {
			return elem[ name ] === true ? name.toLowerCase() :
					(val = elem.getAttributeNode( name )) && val.specified ?
					val.value :
				null;
		}
	});
}

return Sizzle;

})( window );



jQuery.find = Sizzle;
jQuery.expr = Sizzle.selectors;
jQuery.expr[":"] = jQuery.expr.pseudos;
jQuery.unique = Sizzle.uniqueSort;
jQuery.text = Sizzle.getText;
jQuery.isXMLDoc = Sizzle.isXML;
jQuery.contains = Sizzle.contains;



var rneedsContext = jQuery.expr.match.needsContext;

var rsingleTag = (/^<(\w+)\s*\/?>(?:<\/\1>|)$/);



var risSimple = /^.[^:#\[\.,]*$/;

// Implement the identical functionality for filter and not
function winnow( elements, qualifier, not ) {
	if ( jQuery.isFunction( qualifier ) ) {
		return jQuery.grep( elements, function( elem, i ) {
			/* jshint -W018 */
			return !!qualifier.call( elem, i, elem ) !== not;
		});

	}

	if ( qualifier.nodeType ) {
		return jQuery.grep( elements, function( elem ) {
			return ( elem === qualifier ) !== not;
		});

	}

	if ( typeof qualifier === "string" ) {
		if ( risSimple.test( qualifier ) ) {
			return jQuery.filter( qualifier, elements, not );
		}

		qualifier = jQuery.filter( qualifier, elements );
	}

	return jQuery.grep( elements, function( elem ) {
		return ( jQuery.inArray( elem, qualifier ) >= 0 ) !== not;
	});
}

jQuery.filter = function( expr, elems, not ) {
	var elem = elems[ 0 ];

	if ( not ) {
		expr = ":not(" + expr + ")";
	}

	return elems.length === 1 && elem.nodeType === 1 ?
		jQuery.find.matchesSelector( elem, expr ) ? [ elem ] : [] :
		jQuery.find.matches( expr, jQuery.grep( elems, function( elem ) {
			return elem.nodeType === 1;
		}));
};

jQuery.fn.extend({
	find: function( selector ) {
		var i,
			ret = [],
			self = this,
			len = self.length;

		if ( typeof selector !== "string" ) {
			return this.pushStack( jQuery( selector ).filter(function() {
				for ( i = 0; i < len; i++ ) {
					if ( jQuery.contains( self[ i ], this ) ) {
						return true;
					}
				}
			}) );
		}

		for ( i = 0; i < len; i++ ) {
			jQuery.find( selector, self[ i ], ret );
		}

		// Needed because $( selector, context ) becomes $( context ).find( selector )
		ret = this.pushStack( len > 1 ? jQuery.unique( ret ) : ret );
		ret.selector = this.selector ? this.selector + " " + selector : selector;
		return ret;
	},
	filter: function( selector ) {
		return this.pushStack( winnow(this, selector || [], false) );
	},
	not: function( selector ) {
		return this.pushStack( winnow(this, selector || [], true) );
	},
	is: function( selector ) {
		return !!winnow(
			this,

			// If this is a positional/relative selector, check membership in the returned set
			// so $("p:first").is("p:last") won't return true for a doc with two "p".
			typeof selector === "string" && rneedsContext.test( selector ) ?
				jQuery( selector ) :
				selector || [],
			false
		).length;
	}
});


// Initialize a jQuery object


// A central reference to the root jQuery(document)
var rootjQuery,

	// Use the correct document accordingly with window argument (sandbox)
	document = window.document,

	// A simple way to check for HTML strings
	// Prioritize #id over <tag> to avoid XSS via location.hash (#9521)
	// Strict HTML recognition (#11290: must start with <)
	rquickExpr = /^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]*))$/,

	init = jQuery.fn.init = function( selector, context ) {
		var match, elem;

		// HANDLE: $(""), $(null), $(undefined), $(false)
		if ( !selector ) {
			return this;
		}

		// Handle HTML strings
		if ( typeof selector === "string" ) {
			if ( selector.charAt(0) === "<" && selector.charAt( selector.length - 1 ) === ">" && selector.length >= 3 ) {
				// Assume that strings that start and end with <> are HTML and skip the regex check
				match = [ null, selector, null ];

			} else {
				match = rquickExpr.exec( selector );
			}

			// Match html or make sure no context is specified for #id
			if ( match && (match[1] || !context) ) {

				// HANDLE: $(html) -> $(array)
				if ( match[1] ) {
					context = context instanceof jQuery ? context[0] : context;

					// scripts is true for back-compat
					// Intentionally let the error be thrown if parseHTML is not present
					jQuery.merge( this, jQuery.parseHTML(
						match[1],
						context && context.nodeType ? context.ownerDocument || context : document,
						true
					) );

					// HANDLE: $(html, props)
					if ( rsingleTag.test( match[1] ) && jQuery.isPlainObject( context ) ) {
						for ( match in context ) {
							// Properties of context are called as methods if possible
							if ( jQuery.isFunction( this[ match ] ) ) {
								this[ match ]( context[ match ] );

							// ...and otherwise set as attributes
							} else {
								this.attr( match, context[ match ] );
							}
						}
					}

					return this;

				// HANDLE: $(#id)
				} else {
					elem = document.getElementById( match[2] );

					// Check parentNode to catch when Blackberry 4.6 returns
					// nodes that are no longer in the document #6963
					if ( elem && elem.parentNode ) {
						// Handle the case where IE and Opera return items
						// by name instead of ID
						if ( elem.id !== match[2] ) {
							return rootjQuery.find( selector );
						}

						// Otherwise, we inject the element directly into the jQuery object
						this.length = 1;
						this[0] = elem;
					}

					this.context = document;
					this.selector = selector;
					return this;
				}

			// HANDLE: $(expr, $(...))
			} else if ( !context || context.jquery ) {
				return ( context || rootjQuery ).find( selector );

			// HANDLE: $(expr, context)
			// (which is just equivalent to: $(context).find(expr)
			} else {
				return this.constructor( context ).find( selector );
			}

		// HANDLE: $(DOMElement)
		} else if ( selector.nodeType ) {
			this.context = this[0] = selector;
			this.length = 1;
			return this;

		// HANDLE: $(function)
		// Shortcut for document ready
		} else if ( jQuery.isFunction( selector ) ) {
			return typeof rootjQuery.ready !== "undefined" ?
				rootjQuery.ready( selector ) :
				// Execute immediately if ready is not present
				selector( jQuery );
		}

		if ( selector.selector !== undefined ) {
			this.selector = selector.selector;
			this.context = selector.context;
		}

		return jQuery.makeArray( selector, this );
	};

// Give the init function the jQuery prototype for later instantiation
init.prototype = jQuery.fn;

// Initialize central reference
rootjQuery = jQuery( document );


var rparentsprev = /^(?:parents|prev(?:Until|All))/,
	// methods guaranteed to produce a unique set when starting from a unique set
	guaranteedUnique = {
		children: true,
		contents: true,
		next: true,
		prev: true
	};

jQuery.extend({
	dir: function( elem, dir, until ) {
		var matched = [],
			cur = elem[ dir ];

		while ( cur && cur.nodeType !== 9 && (until === undefined || cur.nodeType !== 1 || !jQuery( cur ).is( until )) ) {
			if ( cur.nodeType === 1 ) {
				matched.push( cur );
			}
			cur = cur[dir];
		}
		return matched;
	},

	sibling: function( n, elem ) {
		var r = [];

		for ( ; n; n = n.nextSibling ) {
			if ( n.nodeType === 1 && n !== elem ) {
				r.push( n );
			}
		}

		return r;
	}
});

jQuery.fn.extend({
	has: function( target ) {
		var i,
			targets = jQuery( target, this ),
			len = targets.length;

		return this.filter(function() {
			for ( i = 0; i < len; i++ ) {
				if ( jQuery.contains( this, targets[i] ) ) {
					return true;
				}
			}
		});
	},

	closest: function( selectors, context ) {
		var cur,
			i = 0,
			l = this.length,
			matched = [],
			pos = rneedsContext.test( selectors ) || typeof selectors !== "string" ?
				jQuery( selectors, context || this.context ) :
				0;

		for ( ; i < l; i++ ) {
			for ( cur = this[i]; cur && cur !== context; cur = cur.parentNode ) {
				// Always skip document fragments
				if ( cur.nodeType < 11 && (pos ?
					pos.index(cur) > -1 :

					// Don't pass non-elements to Sizzle
					cur.nodeType === 1 &&
						jQuery.find.matchesSelector(cur, selectors)) ) {

					matched.push( cur );
					break;
				}
			}
		}

		return this.pushStack( matched.length > 1 ? jQuery.unique( matched ) : matched );
	},

	// Determine the position of an element within
	// the matched set of elements
	index: function( elem ) {

		// No argument, return index in parent
		if ( !elem ) {
			return ( this[0] && this[0].parentNode ) ? this.first().prevAll().length : -1;
		}

		// index in selector
		if ( typeof elem === "string" ) {
			return jQuery.inArray( this[0], jQuery( elem ) );
		}

		// Locate the position of the desired element
		return jQuery.inArray(
			// If it receives a jQuery object, the first element is used
			elem.jquery ? elem[0] : elem, this );
	},

	add: function( selector, context ) {
		return this.pushStack(
			jQuery.unique(
				jQuery.merge( this.get(), jQuery( selector, context ) )
			)
		);
	},

	addBack: function( selector ) {
		return this.add( selector == null ?
			this.prevObject : this.prevObject.filter(selector)
		);
	}
});

function sibling( cur, dir ) {
	do {
		cur = cur[ dir ];
	} while ( cur && cur.nodeType !== 1 );

	return cur;
}

jQuery.each({
	parent: function( elem ) {
		var parent = elem.parentNode;
		return parent && parent.nodeType !== 11 ? parent : null;
	},
	parents: function( elem ) {
		return jQuery.dir( elem, "parentNode" );
	},
	parentsUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "parentNode", until );
	},
	next: function( elem ) {
		return sibling( elem, "nextSibling" );
	},
	prev: function( elem ) {
		return sibling( elem, "previousSibling" );
	},
	nextAll: function( elem ) {
		return jQuery.dir( elem, "nextSibling" );
	},
	prevAll: function( elem ) {
		return jQuery.dir( elem, "previousSibling" );
	},
	nextUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "nextSibling", until );
	},
	prevUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "previousSibling", until );
	},
	siblings: function( elem ) {
		return jQuery.sibling( ( elem.parentNode || {} ).firstChild, elem );
	},
	children: function( elem ) {
		return jQuery.sibling( elem.firstChild );
	},
	contents: function( elem ) {
		return jQuery.nodeName( elem, "iframe" ) ?
			elem.contentDocument || elem.contentWindow.document :
			jQuery.merge( [], elem.childNodes );
	}
}, function( name, fn ) {
	jQuery.fn[ name ] = function( until, selector ) {
		var ret = jQuery.map( this, fn, until );

		if ( name.slice( -5 ) !== "Until" ) {
			selector = until;
		}

		if ( selector && typeof selector === "string" ) {
			ret = jQuery.filter( selector, ret );
		}

		if ( this.length > 1 ) {
			// Remove duplicates
			if ( !guaranteedUnique[ name ] ) {
				ret = jQuery.unique( ret );
			}

			// Reverse order for parents* and prev-derivatives
			if ( rparentsprev.test( name ) ) {
				ret = ret.reverse();
			}
		}

		return this.pushStack( ret );
	};
});
var rnotwhite = (/\S+/g);



// String to Object options format cache
var optionsCache = {};

// Convert String-formatted options into Object-formatted ones and store in cache
function createOptions( options ) {
	var object = optionsCache[ options ] = {};
	jQuery.each( options.match( rnotwhite ) || [], function( _, flag ) {
		object[ flag ] = true;
	});
	return object;
}

/*
 * Create a callback list using the following parameters:
 *
 *	options: an optional list of space-separated options that will change how
 *			the callback list behaves or a more traditional option object
 *
 * By default a callback list will act like an event callback list and can be
 * "fired" multiple times.
 *
 * Possible options:
 *
 *	once:			will ensure the callback list can only be fired once (like a Deferred)
 *
 *	memory:			will keep track of previous values and will call any callback added
 *					after the list has been fired right away with the latest "memorized"
 *					values (like a Deferred)
 *
 *	unique:			will ensure a callback can only be added once (no duplicate in the list)
 *
 *	stopOnFalse:	interrupt callings when a callback returns false
 *
 */
jQuery.Callbacks = function( options ) {

	// Convert options from String-formatted to Object-formatted if needed
	// (we check in cache first)
	options = typeof options === "string" ?
		( optionsCache[ options ] || createOptions( options ) ) :
		jQuery.extend( {}, options );

	var // Flag to know if list is currently firing
		firing,
		// Last fire value (for non-forgettable lists)
		memory,
		// Flag to know if list was already fired
		fired,
		// End of the loop when firing
		firingLength,
		// Index of currently firing callback (modified by remove if needed)
		firingIndex,
		// First callback to fire (used internally by add and fireWith)
		firingStart,
		// Actual callback list
		list = [],
		// Stack of fire calls for repeatable lists
		stack = !options.once && [],
		// Fire callbacks
		fire = function( data ) {
			memory = options.memory && data;
			fired = true;
			firingIndex = firingStart || 0;
			firingStart = 0;
			firingLength = list.length;
			firing = true;
			for ( ; list && firingIndex < firingLength; firingIndex++ ) {
				if ( list[ firingIndex ].apply( data[ 0 ], data[ 1 ] ) === false && options.stopOnFalse ) {
					memory = false; // To prevent further calls using add
					break;
				}
			}
			firing = false;
			if ( list ) {
				if ( stack ) {
					if ( stack.length ) {
						fire( stack.shift() );
					}
				} else if ( memory ) {
					list = [];
				} else {
					self.disable();
				}
			}
		},
		// Actual Callbacks object
		self = {
			// Add a callback or a collection of callbacks to the list
			add: function() {
				if ( list ) {
					// First, we save the current length
					var start = list.length;
					(function add( args ) {
						jQuery.each( args, function( _, arg ) {
							var type = jQuery.type( arg );
							if ( type === "function" ) {
								if ( !options.unique || !self.has( arg ) ) {
									list.push( arg );
								}
							} else if ( arg && arg.length && type !== "string" ) {
								// Inspect recursively
								add( arg );
							}
						});
					})( arguments );
					// Do we need to add the callbacks to the
					// current firing batch?
					if ( firing ) {
						firingLength = list.length;
					// With memory, if we're not firing then
					// we should call right away
					} else if ( memory ) {
						firingStart = start;
						fire( memory );
					}
				}
				return this;
			},
			// Remove a callback from the list
			remove: function() {
				if ( list ) {
					jQuery.each( arguments, function( _, arg ) {
						var index;
						while ( ( index = jQuery.inArray( arg, list, index ) ) > -1 ) {
							list.splice( index, 1 );
							// Handle firing indexes
							if ( firing ) {
								if ( index <= firingLength ) {
									firingLength--;
								}
								if ( index <= firingIndex ) {
									firingIndex--;
								}
							}
						}
					});
				}
				return this;
			},
			// Check if a given callback is in the list.
			// If no argument is given, return whether or not list has callbacks attached.
			has: function( fn ) {
				return fn ? jQuery.inArray( fn, list ) > -1 : !!( list && list.length );
			},
			// Remove all callbacks from the list
			empty: function() {
				list = [];
				firingLength = 0;
				return this;
			},
			// Have the list do nothing anymore
			disable: function() {
				list = stack = memory = undefined;
				return this;
			},
			// Is it disabled?
			disabled: function() {
				return !list;
			},
			// Lock the list in its current state
			lock: function() {
				stack = undefined;
				if ( !memory ) {
					self.disable();
				}
				return this;
			},
			// Is it locked?
			locked: function() {
				return !stack;
			},
			// Call all callbacks with the given context and arguments
			fireWith: function( context, args ) {
				if ( list && ( !fired || stack ) ) {
					args = args || [];
					args = [ context, args.slice ? args.slice() : args ];
					if ( firing ) {
						stack.push( args );
					} else {
						fire( args );
					}
				}
				return this;
			},
			// Call all the callbacks with the given arguments
			fire: function() {
				self.fireWith( this, arguments );
				return this;
			},
			// To know if the callbacks have already been called at least once
			fired: function() {
				return !!fired;
			}
		};

	return self;
};


jQuery.extend({

	Deferred: function( func ) {
		var tuples = [
				// action, add listener, listener list, final state
				[ "resolve", "done", jQuery.Callbacks("once memory"), "resolved" ],
				[ "reject", "fail", jQuery.Callbacks("once memory"), "rejected" ],
				[ "notify", "progress", jQuery.Callbacks("memory") ]
			],
			state = "pending",
			promise = {
				state: function() {
					return state;
				},
				always: function() {
					deferred.done( arguments ).fail( arguments );
					return this;
				},
				then: function( /* fnDone, fnFail, fnProgress */ ) {
					var fns = arguments;
					return jQuery.Deferred(function( newDefer ) {
						jQuery.each( tuples, function( i, tuple ) {
							var fn = jQuery.isFunction( fns[ i ] ) && fns[ i ];
							// deferred[ done | fail | progress ] for forwarding actions to newDefer
							deferred[ tuple[1] ](function() {
								var returned = fn && fn.apply( this, arguments );
								if ( returned && jQuery.isFunction( returned.promise ) ) {
									returned.promise()
										.done( newDefer.resolve )
										.fail( newDefer.reject )
										.progress( newDefer.notify );
								} else {
									newDefer[ tuple[ 0 ] + "With" ]( this === promise ? newDefer.promise() : this, fn ? [ returned ] : arguments );
								}
							});
						});
						fns = null;
					}).promise();
				},
				// Get a promise for this deferred
				// If obj is provided, the promise aspect is added to the object
				promise: function( obj ) {
					return obj != null ? jQuery.extend( obj, promise ) : promise;
				}
			},
			deferred = {};

		// Keep pipe for back-compat
		promise.pipe = promise.then;

		// Add list-specific methods
		jQuery.each( tuples, function( i, tuple ) {
			var list = tuple[ 2 ],
				stateString = tuple[ 3 ];

			// promise[ done | fail | progress ] = list.add
			promise[ tuple[1] ] = list.add;

			// Handle state
			if ( stateString ) {
				list.add(function() {
					// state = [ resolved | rejected ]
					state = stateString;

				// [ reject_list | resolve_list ].disable; progress_list.lock
				}, tuples[ i ^ 1 ][ 2 ].disable, tuples[ 2 ][ 2 ].lock );
			}

			// deferred[ resolve | reject | notify ]
			deferred[ tuple[0] ] = function() {
				deferred[ tuple[0] + "With" ]( this === deferred ? promise : this, arguments );
				return this;
			};
			deferred[ tuple[0] + "With" ] = list.fireWith;
		});

		// Make the deferred a promise
		promise.promise( deferred );

		// Call given func if any
		if ( func ) {
			func.call( deferred, deferred );
		}

		// All done!
		return deferred;
	},

	// Deferred helper
	when: function( subordinate /* , ..., subordinateN */ ) {
		var i = 0,
			resolveValues = slice.call( arguments ),
			length = resolveValues.length,

			// the count of uncompleted subordinates
			remaining = length !== 1 || ( subordinate && jQuery.isFunction( subordinate.promise ) ) ? length : 0,

			// the master Deferred. If resolveValues consist of only a single Deferred, just use that.
			deferred = remaining === 1 ? subordinate : jQuery.Deferred(),

			// Update function for both resolve and progress values
			updateFunc = function( i, contexts, values ) {
				return function( value ) {
					contexts[ i ] = this;
					values[ i ] = arguments.length > 1 ? slice.call( arguments ) : value;
					if ( values === progressValues ) {
						deferred.notifyWith( contexts, values );

					} else if ( !(--remaining) ) {
						deferred.resolveWith( contexts, values );
					}
				};
			},

			progressValues, progressContexts, resolveContexts;

		// add listeners to Deferred subordinates; treat others as resolved
		if ( length > 1 ) {
			progressValues = new Array( length );
			progressContexts = new Array( length );
			resolveContexts = new Array( length );
			for ( ; i < length; i++ ) {
				if ( resolveValues[ i ] && jQuery.isFunction( resolveValues[ i ].promise ) ) {
					resolveValues[ i ].promise()
						.done( updateFunc( i, resolveContexts, resolveValues ) )
						.fail( deferred.reject )
						.progress( updateFunc( i, progressContexts, progressValues ) );
				} else {
					--remaining;
				}
			}
		}

		// if we're not waiting on anything, resolve the master
		if ( !remaining ) {
			deferred.resolveWith( resolveContexts, resolveValues );
		}

		return deferred.promise();
	}
});


// The deferred used on DOM ready
var readyList;

jQuery.fn.ready = function( fn ) {
	// Add the callback
	jQuery.ready.promise().done( fn );

	return this;
};

jQuery.extend({
	// Is the DOM ready to be used? Set to true once it occurs.
	isReady: false,

	// A counter to track how many items to wait for before
	// the ready event fires. See #6781
	readyWait: 1,

	// Hold (or release) the ready event
	holdReady: function( hold ) {
		if ( hold ) {
			jQuery.readyWait++;
		} else {
			jQuery.ready( true );
		}
	},

	// Handle when the DOM is ready
	ready: function( wait ) {

		// Abort if there are pending holds or we're already ready
		if ( wait === true ? --jQuery.readyWait : jQuery.isReady ) {
			return;
		}

		// Make sure body exists, at least, in case IE gets a little overzealous (ticket #5443).
		if ( !document.body ) {
			return setTimeout( jQuery.ready );
		}

		// Remember that the DOM is ready
		jQuery.isReady = true;

		// If a normal DOM Ready event fired, decrement, and wait if need be
		if ( wait !== true && --jQuery.readyWait > 0 ) {
			return;
		}

		// If there are functions bound, to execute
		readyList.resolveWith( document, [ jQuery ] );

		// Trigger any bound ready events
		if ( jQuery.fn.triggerHandler ) {
			jQuery( document ).triggerHandler( "ready" );
			jQuery( document ).off( "ready" );
		}
	}
});

/**
 * Clean-up method for dom ready events
 */
function detach() {
	if ( document.addEventListener ) {
		document.removeEventListener( "DOMContentLoaded", completed, false );
		window.removeEventListener( "load", completed, false );

	} else {
		document.detachEvent( "onreadystatechange", completed );
		window.detachEvent( "onload", completed );
	}
}

/**
 * The ready event handler and self cleanup method
 */
function completed() {
	// readyState === "complete" is good enough for us to call the dom ready in oldIE
	if ( document.addEventListener || event.type === "load" || document.readyState === "complete" ) {
		detach();
		jQuery.ready();
	}
}

jQuery.ready.promise = function( obj ) {
	if ( !readyList ) {

		readyList = jQuery.Deferred();

		// Catch cases where $(document).ready() is called after the browser event has already occurred.
		// we once tried to use readyState "interactive" here, but it caused issues like the one
		// discovered by ChrisS here: http://bugs.jquery.com/ticket/12282#comment:15
		if ( document.readyState === "complete" ) {
			// Handle it asynchronously to allow scripts the opportunity to delay ready
			setTimeout( jQuery.ready );

		// Standards-based browsers support DOMContentLoaded
		} else if ( document.addEventListener ) {
			// Use the handy event callback
			document.addEventListener( "DOMContentLoaded", completed, false );

			// A fallback to window.onload, that will always work
			window.addEventListener( "load", completed, false );

		// If IE event model is used
		} else {
			// Ensure firing before onload, maybe late but safe also for iframes
			document.attachEvent( "onreadystatechange", completed );

			// A fallback to window.onload, that will always work
			window.attachEvent( "onload", completed );

			// If IE and not a frame
			// continually check to see if the document is ready
			var top = false;

			try {
				top = window.frameElement == null && document.documentElement;
			} catch(e) {}

			if ( top && top.doScroll ) {
				(function doScrollCheck() {
					if ( !jQuery.isReady ) {

						try {
							// Use the trick by Diego Perini
							// http://javascript.nwbox.com/IEContentLoaded/
							top.doScroll("left");
						} catch(e) {
							return setTimeout( doScrollCheck, 50 );
						}

						// detach all dom ready events
						detach();

						// and execute any waiting functions
						jQuery.ready();
					}
				})();
			}
		}
	}
	return readyList.promise( obj );
};


var strundefined = typeof undefined;



// Support: IE<9
// Iteration over object's inherited properties before its own
var i;
for ( i in jQuery( support ) ) {
	break;
}
support.ownLast = i !== "0";

// Note: most support tests are defined in their respective modules.
// false until the test is run
support.inlineBlockNeedsLayout = false;

// Execute ASAP in case we need to set body.style.zoom
jQuery(function() {
	// Minified: var a,b,c,d
	var val, div, body, container;

	body = document.getElementsByTagName( "body" )[ 0 ];
	if ( !body || !body.style ) {
		// Return for frameset docs that don't have a body
		return;
	}

	// Setup
	div = document.createElement( "div" );
	container = document.createElement( "div" );
	container.style.cssText = "position:absolute;border:0;width:0;height:0;top:0;left:-9999px";
	body.appendChild( container ).appendChild( div );

	if ( typeof div.style.zoom !== strundefined ) {
		// Support: IE<8
		// Check if natively block-level elements act like inline-block
		// elements when setting their display to 'inline' and giving
		// them layout
		div.style.cssText = "display:inline;margin:0;border:0;padding:1px;width:1px;zoom:1";

		support.inlineBlockNeedsLayout = val = div.offsetWidth === 3;
		if ( val ) {
			// Prevent IE 6 from affecting layout for positioned elements #11048
			// Prevent IE from shrinking the body in IE 7 mode #12869
			// Support: IE<8
			body.style.zoom = 1;
		}
	}

	body.removeChild( container );
});




(function() {
	var div = document.createElement( "div" );

	// Execute the test only if not already executed in another module.
	if (support.deleteExpando == null) {
		// Support: IE<9
		support.deleteExpando = true;
		try {
			delete div.test;
		} catch( e ) {
			support.deleteExpando = false;
		}
	}

	// Null elements to avoid leaks in IE.
	div = null;
})();


/**
 * Determines whether an object can have data
 */
jQuery.acceptData = function( elem ) {
	var noData = jQuery.noData[ (elem.nodeName + " ").toLowerCase() ],
		nodeType = +elem.nodeType || 1;

	// Do not set data on non-element DOM nodes because it will not be cleared (#8335).
	return nodeType !== 1 && nodeType !== 9 ?
		false :

		// Nodes accept data unless otherwise specified; rejection can be conditional
		!noData || noData !== true && elem.getAttribute("classid") === noData;
};


var rbrace = /^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,
	rmultiDash = /([A-Z])/g;

function dataAttr( elem, key, data ) {
	// If nothing was found internally, try to fetch any
	// data from the HTML5 data-* attribute
	if ( data === undefined && elem.nodeType === 1 ) {

		var name = "data-" + key.replace( rmultiDash, "-$1" ).toLowerCase();

		data = elem.getAttribute( name );

		if ( typeof data === "string" ) {
			try {
				data = data === "true" ? true :
					data === "false" ? false :
					data === "null" ? null :
					// Only convert to a number if it doesn't change the string
					+data + "" === data ? +data :
					rbrace.test( data ) ? jQuery.parseJSON( data ) :
					data;
			} catch( e ) {}

			// Make sure we set the data so it isn't changed later
			jQuery.data( elem, key, data );

		} else {
			data = undefined;
		}
	}

	return data;
}

// checks a cache object for emptiness
function isEmptyDataObject( obj ) {
	var name;
	for ( name in obj ) {

		// if the public data object is empty, the private is still empty
		if ( name === "data" && jQuery.isEmptyObject( obj[name] ) ) {
			continue;
		}
		if ( name !== "toJSON" ) {
			return false;
		}
	}

	return true;
}

function internalData( elem, name, data, pvt /* Internal Use Only */ ) {
	if ( !jQuery.acceptData( elem ) ) {
		return;
	}

	var ret, thisCache,
		internalKey = jQuery.expando,

		// We have to handle DOM nodes and JS objects differently because IE6-7
		// can't GC object references properly across the DOM-JS boundary
		isNode = elem.nodeType,

		// Only DOM nodes need the global jQuery cache; JS object data is
		// attached directly to the object so GC can occur automatically
		cache = isNode ? jQuery.cache : elem,

		// Only defining an ID for JS objects if its cache already exists allows
		// the code to shortcut on the same path as a DOM node with no cache
		id = isNode ? elem[ internalKey ] : elem[ internalKey ] && internalKey;

	// Avoid doing any more work than we need to when trying to get data on an
	// object that has no data at all
	if ( (!id || !cache[id] || (!pvt && !cache[id].data)) && data === undefined && typeof name === "string" ) {
		return;
	}

	if ( !id ) {
		// Only DOM nodes need a new unique ID for each element since their data
		// ends up in the global cache
		if ( isNode ) {
			id = elem[ internalKey ] = deletedIds.pop() || jQuery.guid++;
		} else {
			id = internalKey;
		}
	}

	if ( !cache[ id ] ) {
		// Avoid exposing jQuery metadata on plain JS objects when the object
		// is serialized using JSON.stringify
		cache[ id ] = isNode ? {} : { toJSON: jQuery.noop };
	}

	// An object can be passed to jQuery.data instead of a key/value pair; this gets
	// shallow copied over onto the existing cache
	if ( typeof name === "object" || typeof name === "function" ) {
		if ( pvt ) {
			cache[ id ] = jQuery.extend( cache[ id ], name );
		} else {
			cache[ id ].data = jQuery.extend( cache[ id ].data, name );
		}
	}

	thisCache = cache[ id ];

	// jQuery data() is stored in a separate object inside the object's internal data
	// cache in order to avoid key collisions between internal data and user-defined
	// data.
	if ( !pvt ) {
		if ( !thisCache.data ) {
			thisCache.data = {};
		}

		thisCache = thisCache.data;
	}

	if ( data !== undefined ) {
		thisCache[ jQuery.camelCase( name ) ] = data;
	}

	// Check for both converted-to-camel and non-converted data property names
	// If a data property was specified
	if ( typeof name === "string" ) {

		// First Try to find as-is property data
		ret = thisCache[ name ];

		// Test for null|undefined property data
		if ( ret == null ) {

			// Try to find the camelCased property
			ret = thisCache[ jQuery.camelCase( name ) ];
		}
	} else {
		ret = thisCache;
	}

	return ret;
}

function internalRemoveData( elem, name, pvt ) {
	if ( !jQuery.acceptData( elem ) ) {
		return;
	}

	var thisCache, i,
		isNode = elem.nodeType,

		// See jQuery.data for more information
		cache = isNode ? jQuery.cache : elem,
		id = isNode ? elem[ jQuery.expando ] : jQuery.expando;

	// If there is already no cache entry for this object, there is no
	// purpose in continuing
	if ( !cache[ id ] ) {
		return;
	}

	if ( name ) {

		thisCache = pvt ? cache[ id ] : cache[ id ].data;

		if ( thisCache ) {

			// Support array or space separated string names for data keys
			if ( !jQuery.isArray( name ) ) {

				// try the string as a key before any manipulation
				if ( name in thisCache ) {
					name = [ name ];
				} else {

					// split the camel cased version by spaces unless a key with the spaces exists
					name = jQuery.camelCase( name );
					if ( name in thisCache ) {
						name = [ name ];
					} else {
						name = name.split(" ");
					}
				}
			} else {
				// If "name" is an array of keys...
				// When data is initially created, via ("key", "val") signature,
				// keys will be converted to camelCase.
				// Since there is no way to tell _how_ a key was added, remove
				// both plain key and camelCase key. #12786
				// This will only penalize the array argument path.
				name = name.concat( jQuery.map( name, jQuery.camelCase ) );
			}

			i = name.length;
			while ( i-- ) {
				delete thisCache[ name[i] ];
			}

			// If there is no data left in the cache, we want to continue
			// and let the cache object itself get destroyed
			if ( pvt ? !isEmptyDataObject(thisCache) : !jQuery.isEmptyObject(thisCache) ) {
				return;
			}
		}
	}

	// See jQuery.data for more information
	if ( !pvt ) {
		delete cache[ id ].data;

		// Don't destroy the parent cache unless the internal data object
		// had been the only thing left in it
		if ( !isEmptyDataObject( cache[ id ] ) ) {
			return;
		}
	}

	// Destroy the cache
	if ( isNode ) {
		jQuery.cleanData( [ elem ], true );

	// Use delete when supported for expandos or `cache` is not a window per isWindow (#10080)
	/* jshint eqeqeq: false */
	} else if ( support.deleteExpando || cache != cache.window ) {
		/* jshint eqeqeq: true */
		delete cache[ id ];

	// When all else fails, null
	} else {
		cache[ id ] = null;
	}
}

jQuery.extend({
	cache: {},

	// The following elements (space-suffixed to avoid Object.prototype collisions)
	// throw uncatchable exceptions if you attempt to set expando properties
	noData: {
		"applet ": true,
		"embed ": true,
		// ...but Flash objects (which have this classid) *can* handle expandos
		"object ": "clsid:D27CDB6E-AE6D-11cf-96B8-444553540000"
	},

	hasData: function( elem ) {
		elem = elem.nodeType ? jQuery.cache[ elem[jQuery.expando] ] : elem[ jQuery.expando ];
		return !!elem && !isEmptyDataObject( elem );
	},

	data: function( elem, name, data ) {
		return internalData( elem, name, data );
	},

	removeData: function( elem, name ) {
		return internalRemoveData( elem, name );
	},

	// For internal use only.
	_data: function( elem, name, data ) {
		return internalData( elem, name, data, true );
	},

	_removeData: function( elem, name ) {
		return internalRemoveData( elem, name, true );
	}
});

jQuery.fn.extend({
	data: function( key, value ) {
		var i, name, data,
			elem = this[0],
			attrs = elem && elem.attributes;

		// Special expections of .data basically thwart jQuery.access,
		// so implement the relevant behavior ourselves

		// Gets all values
		if ( key === undefined ) {
			if ( this.length ) {
				data = jQuery.data( elem );

				if ( elem.nodeType === 1 && !jQuery._data( elem, "parsedAttrs" ) ) {
					i = attrs.length;
					while ( i-- ) {

						// Support: IE11+
						// The attrs elements can be null (#14894)
						if ( attrs[ i ] ) {
							name = attrs[ i ].name;
							if ( name.indexOf( "data-" ) === 0 ) {
								name = jQuery.camelCase( name.slice(5) );
								dataAttr( elem, name, data[ name ] );
							}
						}
					}
					jQuery._data( elem, "parsedAttrs", true );
				}
			}

			return data;
		}

		// Sets multiple values
		if ( typeof key === "object" ) {
			return this.each(function() {
				jQuery.data( this, key );
			});
		}

		return arguments.length > 1 ?

			// Sets one value
			this.each(function() {
				jQuery.data( this, key, value );
			}) :

			// Gets one value
			// Try to fetch any internally stored data first
			elem ? dataAttr( elem, key, jQuery.data( elem, key ) ) : undefined;
	},

	removeData: function( key ) {
		return this.each(function() {
			jQuery.removeData( this, key );
		});
	}
});


jQuery.extend({
	queue: function( elem, type, data ) {
		var queue;

		if ( elem ) {
			type = ( type || "fx" ) + "queue";
			queue = jQuery._data( elem, type );

			// Speed up dequeue by getting out quickly if this is just a lookup
			if ( data ) {
				if ( !queue || jQuery.isArray(data) ) {
					queue = jQuery._data( elem, type, jQuery.makeArray(data) );
				} else {
					queue.push( data );
				}
			}
			return queue || [];
		}
	},

	dequeue: function( elem, type ) {
		type = type || "fx";

		var queue = jQuery.queue( elem, type ),
			startLength = queue.length,
			fn = queue.shift(),
			hooks = jQuery._queueHooks( elem, type ),
			next = function() {
				jQuery.dequeue( elem, type );
			};

		// If the fx queue is dequeued, always remove the progress sentinel
		if ( fn === "inprogress" ) {
			fn = queue.shift();
			startLength--;
		}

		if ( fn ) {

			// Add a progress sentinel to prevent the fx queue from being
			// automatically dequeued
			if ( type === "fx" ) {
				queue.unshift( "inprogress" );
			}

			// clear up the last queue stop function
			delete hooks.stop;
			fn.call( elem, next, hooks );
		}

		if ( !startLength && hooks ) {
			hooks.empty.fire();
		}
	},

	// not intended for public consumption - generates a queueHooks object, or returns the current one
	_queueHooks: function( elem, type ) {
		var key = type + "queueHooks";
		return jQuery._data( elem, key ) || jQuery._data( elem, key, {
			empty: jQuery.Callbacks("once memory").add(function() {
				jQuery._removeData( elem, type + "queue" );
				jQuery._removeData( elem, key );
			})
		});
	}
});

jQuery.fn.extend({
	queue: function( type, data ) {
		var setter = 2;

		if ( typeof type !== "string" ) {
			data = type;
			type = "fx";
			setter--;
		}

		if ( arguments.length < setter ) {
			return jQuery.queue( this[0], type );
		}

		return data === undefined ?
			this :
			this.each(function() {
				var queue = jQuery.queue( this, type, data );

				// ensure a hooks for this queue
				jQuery._queueHooks( this, type );

				if ( type === "fx" && queue[0] !== "inprogress" ) {
					jQuery.dequeue( this, type );
				}
			});
	},
	dequeue: function( type ) {
		return this.each(function() {
			jQuery.dequeue( this, type );
		});
	},
	clearQueue: function( type ) {
		return this.queue( type || "fx", [] );
	},
	// Get a promise resolved when queues of a certain type
	// are emptied (fx is the type by default)
	promise: function( type, obj ) {
		var tmp,
			count = 1,
			defer = jQuery.Deferred(),
			elements = this,
			i = this.length,
			resolve = function() {
				if ( !( --count ) ) {
					defer.resolveWith( elements, [ elements ] );
				}
			};

		if ( typeof type !== "string" ) {
			obj = type;
			type = undefined;
		}
		type = type || "fx";

		while ( i-- ) {
			tmp = jQuery._data( elements[ i ], type + "queueHooks" );
			if ( tmp && tmp.empty ) {
				count++;
				tmp.empty.add( resolve );
			}
		}
		resolve();
		return defer.promise( obj );
	}
});
var pnum = (/[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/).source;

var cssExpand = [ "Top", "Right", "Bottom", "Left" ];

var isHidden = function( elem, el ) {
		// isHidden might be called from jQuery#filter function;
		// in that case, element will be second argument
		elem = el || elem;
		return jQuery.css( elem, "display" ) === "none" || !jQuery.contains( elem.ownerDocument, elem );
	};



// Multifunctional method to get and set values of a collection
// The value/s can optionally be executed if it's a function
var access = jQuery.access = function( elems, fn, key, value, chainable, emptyGet, raw ) {
	var i = 0,
		length = elems.length,
		bulk = key == null;

	// Sets many values
	if ( jQuery.type( key ) === "object" ) {
		chainable = true;
		for ( i in key ) {
			jQuery.access( elems, fn, i, key[i], true, emptyGet, raw );
		}

	// Sets one value
	} else if ( value !== undefined ) {
		chainable = true;

		if ( !jQuery.isFunction( value ) ) {
			raw = true;
		}

		if ( bulk ) {
			// Bulk operations run against the entire set
			if ( raw ) {
				fn.call( elems, value );
				fn = null;

			// ...except when executing function values
			} else {
				bulk = fn;
				fn = function( elem, key, value ) {
					return bulk.call( jQuery( elem ), value );
				};
			}
		}

		if ( fn ) {
			for ( ; i < length; i++ ) {
				fn( elems[i], key, raw ? value : value.call( elems[i], i, fn( elems[i], key ) ) );
			}
		}
	}

	return chainable ?
		elems :

		// Gets
		bulk ?
			fn.call( elems ) :
			length ? fn( elems[0], key ) : emptyGet;
};
var rcheckableType = (/^(?:checkbox|radio)$/i);



(function() {
	// Minified: var a,b,c
	var input = document.createElement( "input" ),
		div = document.createElement( "div" ),
		fragment = document.createDocumentFragment();

	// Setup
	div.innerHTML = "  <link/><table></table><a href='/a'>a</a><input type='checkbox'/>";

	// IE strips leading whitespace when .innerHTML is used
	support.leadingWhitespace = div.firstChild.nodeType === 3;

	// Make sure that tbody elements aren't automatically inserted
	// IE will insert them into empty tables
	support.tbody = !div.getElementsByTagName( "tbody" ).length;

	// Make sure that link elements get serialized correctly by innerHTML
	// This requires a wrapper element in IE
	support.htmlSerialize = !!div.getElementsByTagName( "link" ).length;

	// Makes sure cloning an html5 element does not cause problems
	// Where outerHTML is undefined, this still works
	support.html5Clone =
		document.createElement( "nav" ).cloneNode( true ).outerHTML !== "<:nav></:nav>";

	// Check if a disconnected checkbox will retain its checked
	// value of true after appended to the DOM (IE6/7)
	input.type = "checkbox";
	input.checked = true;
	fragment.appendChild( input );
	support.appendChecked = input.checked;

	// Make sure textarea (and checkbox) defaultValue is properly cloned
	// Support: IE6-IE11+
	div.innerHTML = "<textarea>x</textarea>";
	support.noCloneChecked = !!div.cloneNode( true ).lastChild.defaultValue;

	// #11217 - WebKit loses check when the name is after the checked attribute
	fragment.appendChild( div );
	div.innerHTML = "<input type='radio' checked='checked' name='t'/>";

	// Support: Safari 5.1, iOS 5.1, Android 4.x, Android 2.3
	// old WebKit doesn't clone checked state correctly in fragments
	support.checkClone = div.cloneNode( true ).cloneNode( true ).lastChild.checked;

	// Support: IE<9
	// Opera does not clone events (and typeof div.attachEvent === undefined).
	// IE9-10 clones events bound via attachEvent, but they don't trigger with .click()
	support.noCloneEvent = true;
	if ( div.attachEvent ) {
		div.attachEvent( "onclick", function() {
			support.noCloneEvent = false;
		});

		div.cloneNode( true ).click();
	}

	// Execute the test only if not already executed in another module.
	if (support.deleteExpando == null) {
		// Support: IE<9
		support.deleteExpando = true;
		try {
			delete div.test;
		} catch( e ) {
			support.deleteExpando = false;
		}
	}
})();


(function() {
	var i, eventName,
		div = document.createElement( "div" );

	// Support: IE<9 (lack submit/change bubble), Firefox 23+ (lack focusin event)
	for ( i in { submit: true, change: true, focusin: true }) {
		eventName = "on" + i;

		if ( !(support[ i + "Bubbles" ] = eventName in window) ) {
			// Beware of CSP restrictions (https://developer.mozilla.org/en/Security/CSP)
			div.setAttribute( eventName, "t" );
			support[ i + "Bubbles" ] = div.attributes[ eventName ].expando === false;
		}
	}

	// Null elements to avoid leaks in IE.
	div = null;
})();


var rformElems = /^(?:input|select|textarea)$/i,
	rkeyEvent = /^key/,
	rmouseEvent = /^(?:mouse|pointer|contextmenu)|click/,
	rfocusMorph = /^(?:focusinfocus|focusoutblur)$/,
	rtypenamespace = /^([^.]*)(?:\.(.+)|)$/;

function returnTrue() {
	return true;
}

function returnFalse() {
	return false;
}

function safeActiveElement() {
	try {
		return document.activeElement;
	} catch ( err ) { }
}

/*
 * Helper functions for managing events -- not part of the public interface.
 * Props to Dean Edwards' addEvent library for many of the ideas.
 */
jQuery.event = {

	global: {},

	add: function( elem, types, handler, data, selector ) {
		var tmp, events, t, handleObjIn,
			special, eventHandle, handleObj,
			handlers, type, namespaces, origType,
			elemData = jQuery._data( elem );

		// Don't attach events to noData or text/comment nodes (but allow plain objects)
		if ( !elemData ) {
			return;
		}

		// Caller can pass in an object of custom data in lieu of the handler
		if ( handler.handler ) {
			handleObjIn = handler;
			handler = handleObjIn.handler;
			selector = handleObjIn.selector;
		}

		// Make sure that the handler has a unique ID, used to find/remove it later
		if ( !handler.guid ) {
			handler.guid = jQuery.guid++;
		}

		// Init the element's event structure and main handler, if this is the first
		if ( !(events = elemData.events) ) {
			events = elemData.events = {};
		}
		if ( !(eventHandle = elemData.handle) ) {
			eventHandle = elemData.handle = function( e ) {
				// Discard the second event of a jQuery.event.trigger() and
				// when an event is called after a page has unloaded
				return typeof jQuery !== strundefined && (!e || jQuery.event.triggered !== e.type) ?
					jQuery.event.dispatch.apply( eventHandle.elem, arguments ) :
					undefined;
			};
			// Add elem as a property of the handle fn to prevent a memory leak with IE non-native events
			eventHandle.elem = elem;
		}

		// Handle multiple events separated by a space
		types = ( types || "" ).match( rnotwhite ) || [ "" ];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[t] ) || [];
			type = origType = tmp[1];
			namespaces = ( tmp[2] || "" ).split( "." ).sort();

			// There *must* be a type, no attaching namespace-only handlers
			if ( !type ) {
				continue;
			}

			// If event changes its type, use the special event handlers for the changed type
			special = jQuery.event.special[ type ] || {};

			// If selector defined, determine special event api type, otherwise given type
			type = ( selector ? special.delegateType : special.bindType ) || type;

			// Update special based on newly reset type
			special = jQuery.event.special[ type ] || {};

			// handleObj is passed to all event handlers
			handleObj = jQuery.extend({
				type: type,
				origType: origType,
				data: data,
				handler: handler,
				guid: handler.guid,
				selector: selector,
				needsContext: selector && jQuery.expr.match.needsContext.test( selector ),
				namespace: namespaces.join(".")
			}, handleObjIn );

			// Init the event handler queue if we're the first
			if ( !(handlers = events[ type ]) ) {
				handlers = events[ type ] = [];
				handlers.delegateCount = 0;

				// Only use addEventListener/attachEvent if the special events handler returns false
				if ( !special.setup || special.setup.call( elem, data, namespaces, eventHandle ) === false ) {
					// Bind the global event handler to the element
					if ( elem.addEventListener ) {
						elem.addEventListener( type, eventHandle, false );

					} else if ( elem.attachEvent ) {
						elem.attachEvent( "on" + type, eventHandle );
					}
				}
			}

			if ( special.add ) {
				special.add.call( elem, handleObj );

				if ( !handleObj.handler.guid ) {
					handleObj.handler.guid = handler.guid;
				}
			}

			// Add to the element's handler list, delegates in front
			if ( selector ) {
				handlers.splice( handlers.delegateCount++, 0, handleObj );
			} else {
				handlers.push( handleObj );
			}

			// Keep track of which events have ever been used, for event optimization
			jQuery.event.global[ type ] = true;
		}

		// Nullify elem to prevent memory leaks in IE
		elem = null;
	},

	// Detach an event or set of events from an element
	remove: function( elem, types, handler, selector, mappedTypes ) {
		var j, handleObj, tmp,
			origCount, t, events,
			special, handlers, type,
			namespaces, origType,
			elemData = jQuery.hasData( elem ) && jQuery._data( elem );

		if ( !elemData || !(events = elemData.events) ) {
			return;
		}

		// Once for each type.namespace in types; type may be omitted
		types = ( types || "" ).match( rnotwhite ) || [ "" ];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[t] ) || [];
			type = origType = tmp[1];
			namespaces = ( tmp[2] || "" ).split( "." ).sort();

			// Unbind all events (on this namespace, if provided) for the element
			if ( !type ) {
				for ( type in events ) {
					jQuery.event.remove( elem, type + types[ t ], handler, selector, true );
				}
				continue;
			}

			special = jQuery.event.special[ type ] || {};
			type = ( selector ? special.delegateType : special.bindType ) || type;
			handlers = events[ type ] || [];
			tmp = tmp[2] && new RegExp( "(^|\\.)" + namespaces.join("\\.(?:.*\\.|)") + "(\\.|$)" );

			// Remove matching events
			origCount = j = handlers.length;
			while ( j-- ) {
				handleObj = handlers[ j ];

				if ( ( mappedTypes || origType === handleObj.origType ) &&
					( !handler || handler.guid === handleObj.guid ) &&
					( !tmp || tmp.test( handleObj.namespace ) ) &&
					( !selector || selector === handleObj.selector || selector === "**" && handleObj.selector ) ) {
					handlers.splice( j, 1 );

					if ( handleObj.selector ) {
						handlers.delegateCount--;
					}
					if ( special.remove ) {
						special.remove.call( elem, handleObj );
					}
				}
			}

			// Remove generic event handler if we removed something and no more handlers exist
			// (avoids potential for endless recursion during removal of special event handlers)
			if ( origCount && !handlers.length ) {
				if ( !special.teardown || special.teardown.call( elem, namespaces, elemData.handle ) === false ) {
					jQuery.removeEvent( elem, type, elemData.handle );
				}

				delete events[ type ];
			}
		}

		// Remove the expando if it's no longer used
		if ( jQuery.isEmptyObject( events ) ) {
			delete elemData.handle;

			// removeData also checks for emptiness and clears the expando if empty
			// so use it instead of delete
			jQuery._removeData( elem, "events" );
		}
	},

	trigger: function( event, data, elem, onlyHandlers ) {
		var handle, ontype, cur,
			bubbleType, special, tmp, i,
			eventPath = [ elem || document ],
			type = hasOwn.call( event, "type" ) ? event.type : event,
			namespaces = hasOwn.call( event, "namespace" ) ? event.namespace.split(".") : [];

		cur = tmp = elem = elem || document;

		// Don't do events on text and comment nodes
		if ( elem.nodeType === 3 || elem.nodeType === 8 ) {
			return;
		}

		// focus/blur morphs to focusin/out; ensure we're not firing them right now
		if ( rfocusMorph.test( type + jQuery.event.triggered ) ) {
			return;
		}

		if ( type.indexOf(".") >= 0 ) {
			// Namespaced trigger; create a regexp to match event type in handle()
			namespaces = type.split(".");
			type = namespaces.shift();
			namespaces.sort();
		}
		ontype = type.indexOf(":") < 0 && "on" + type;

		// Caller can pass in a jQuery.Event object, Object, or just an event type string
		event = event[ jQuery.expando ] ?
			event :
			new jQuery.Event( type, typeof event === "object" && event );

		// Trigger bitmask: & 1 for native handlers; & 2 for jQuery (always true)
		event.isTrigger = onlyHandlers ? 2 : 3;
		event.namespace = namespaces.join(".");
		event.namespace_re = event.namespace ?
			new RegExp( "(^|\\.)" + namespaces.join("\\.(?:.*\\.|)") + "(\\.|$)" ) :
			null;

		// Clean up the event in case it is being reused
		event.result = undefined;
		if ( !event.target ) {
			event.target = elem;
		}

		// Clone any incoming data and prepend the event, creating the handler arg list
		data = data == null ?
			[ event ] :
			jQuery.makeArray( data, [ event ] );

		// Allow special events to draw outside the lines
		special = jQuery.event.special[ type ] || {};
		if ( !onlyHandlers && special.trigger && special.trigger.apply( elem, data ) === false ) {
			return;
		}

		// Determine event propagation path in advance, per W3C events spec (#9951)
		// Bubble up to document, then to window; watch for a global ownerDocument var (#9724)
		if ( !onlyHandlers && !special.noBubble && !jQuery.isWindow( elem ) ) {

			bubbleType = special.delegateType || type;
			if ( !rfocusMorph.test( bubbleType + type ) ) {
				cur = cur.parentNode;
			}
			for ( ; cur; cur = cur.parentNode ) {
				eventPath.push( cur );
				tmp = cur;
			}

			// Only add window if we got to document (e.g., not plain obj or detached DOM)
			if ( tmp === (elem.ownerDocument || document) ) {
				eventPath.push( tmp.defaultView || tmp.parentWindow || window );
			}
		}

		// Fire handlers on the event path
		i = 0;
		while ( (cur = eventPath[i++]) && !event.isPropagationStopped() ) {

			event.type = i > 1 ?
				bubbleType :
				special.bindType || type;

			// jQuery handler
			handle = ( jQuery._data( cur, "events" ) || {} )[ event.type ] && jQuery._data( cur, "handle" );
			if ( handle ) {
				handle.apply( cur, data );
			}

			// Native handler
			handle = ontype && cur[ ontype ];
			if ( handle && handle.apply && jQuery.acceptData( cur ) ) {
				event.result = handle.apply( cur, data );
				if ( event.result === false ) {
					event.preventDefault();
				}
			}
		}
		event.type = type;

		// If nobody prevented the default action, do it now
		if ( !onlyHandlers && !event.isDefaultPrevented() ) {

			if ( (!special._default || special._default.apply( eventPath.pop(), data ) === false) &&
				jQuery.acceptData( elem ) ) {

				// Call a native DOM method on the target with the same name name as the event.
				// Can't use an .isFunction() check here because IE6/7 fails that test.
				// Don't do default actions on window, that's where global variables be (#6170)
				if ( ontype && elem[ type ] && !jQuery.isWindow( elem ) ) {

					// Don't re-trigger an onFOO event when we call its FOO() method
					tmp = elem[ ontype ];

					if ( tmp ) {
						elem[ ontype ] = null;
					}

					// Prevent re-triggering of the same event, since we already bubbled it above
					jQuery.event.triggered = type;
					try {
						elem[ type ]();
					} catch ( e ) {
						// IE<9 dies on focus/blur to hidden element (#1486,#12518)
						// only reproducible on winXP IE8 native, not IE9 in IE8 mode
					}
					jQuery.event.triggered = undefined;

					if ( tmp ) {
						elem[ ontype ] = tmp;
					}
				}
			}
		}

		return event.result;
	},

	dispatch: function( event ) {

		// Make a writable jQuery.Event from the native event object
		event = jQuery.event.fix( event );

		var i, ret, handleObj, matched, j,
			handlerQueue = [],
			args = slice.call( arguments ),
			handlers = ( jQuery._data( this, "events" ) || {} )[ event.type ] || [],
			special = jQuery.event.special[ event.type ] || {};

		// Use the fix-ed jQuery.Event rather than the (read-only) native event
		args[0] = event;
		event.delegateTarget = this;

		// Call the preDispatch hook for the mapped type, and let it bail if desired
		if ( special.preDispatch && special.preDispatch.call( this, event ) === false ) {
			return;
		}

		// Determine handlers
		handlerQueue = jQuery.event.handlers.call( this, event, handlers );

		// Run delegates first; they may want to stop propagation beneath us
		i = 0;
		while ( (matched = handlerQueue[ i++ ]) && !event.isPropagationStopped() ) {
			event.currentTarget = matched.elem;

			j = 0;
			while ( (handleObj = matched.handlers[ j++ ]) && !event.isImmediatePropagationStopped() ) {

				// Triggered event must either 1) have no namespace, or
				// 2) have namespace(s) a subset or equal to those in the bound event (both can have no namespace).
				if ( !event.namespace_re || event.namespace_re.test( handleObj.namespace ) ) {

					event.handleObj = handleObj;
					event.data = handleObj.data;

					ret = ( (jQuery.event.special[ handleObj.origType ] || {}).handle || handleObj.handler )
							.apply( matched.elem, args );

					if ( ret !== undefined ) {
						if ( (event.result = ret) === false ) {
							event.preventDefault();
							event.stopPropagation();
						}
					}
				}
			}
		}

		// Call the postDispatch hook for the mapped type
		if ( special.postDispatch ) {
			special.postDispatch.call( this, event );
		}

		return event.result;
	},

	handlers: function( event, handlers ) {
		var sel, handleObj, matches, i,
			handlerQueue = [],
			delegateCount = handlers.delegateCount,
			cur = event.target;

		// Find delegate handlers
		// Black-hole SVG <use> instance trees (#13180)
		// Avoid non-left-click bubbling in Firefox (#3861)
		if ( delegateCount && cur.nodeType && (!event.button || event.type !== "click") ) {

			/* jshint eqeqeq: false */
			for ( ; cur != this; cur = cur.parentNode || this ) {
				/* jshint eqeqeq: true */

				// Don't check non-elements (#13208)
				// Don't process clicks on disabled elements (#6911, #8165, #11382, #11764)
				if ( cur.nodeType === 1 && (cur.disabled !== true || event.type !== "click") ) {
					matches = [];
					for ( i = 0; i < delegateCount; i++ ) {
						handleObj = handlers[ i ];

						// Don't conflict with Object.prototype properties (#13203)
						sel = handleObj.selector + " ";

						if ( matches[ sel ] === undefined ) {
							matches[ sel ] = handleObj.needsContext ?
								jQuery( sel, this ).index( cur ) >= 0 :
								jQuery.find( sel, this, null, [ cur ] ).length;
						}
						if ( matches[ sel ] ) {
							matches.push( handleObj );
						}
					}
					if ( matches.length ) {
						handlerQueue.push({ elem: cur, handlers: matches });
					}
				}
			}
		}

		// Add the remaining (directly-bound) handlers
		if ( delegateCount < handlers.length ) {
			handlerQueue.push({ elem: this, handlers: handlers.slice( delegateCount ) });
		}

		return handlerQueue;
	},

	fix: function( event ) {
		if ( event[ jQuery.expando ] ) {
			return event;
		}

		// Create a writable copy of the event object and normalize some properties
		var i, prop, copy,
			type = event.type,
			originalEvent = event,
			fixHook = this.fixHooks[ type ];

		if ( !fixHook ) {
			this.fixHooks[ type ] = fixHook =
				rmouseEvent.test( type ) ? this.mouseHooks :
				rkeyEvent.test( type ) ? this.keyHooks :
				{};
		}
		copy = fixHook.props ? this.props.concat( fixHook.props ) : this.props;

		event = new jQuery.Event( originalEvent );

		i = copy.length;
		while ( i-- ) {
			prop = copy[ i ];
			event[ prop ] = originalEvent[ prop ];
		}

		// Support: IE<9
		// Fix target property (#1925)
		if ( !event.target ) {
			event.target = originalEvent.srcElement || document;
		}

		// Support: Chrome 23+, Safari?
		// Target should not be a text node (#504, #13143)
		if ( event.target.nodeType === 3 ) {
			event.target = event.target.parentNode;
		}

		// Support: IE<9
		// For mouse/key events, metaKey==false if it's undefined (#3368, #11328)
		event.metaKey = !!event.metaKey;

		return fixHook.filter ? fixHook.filter( event, originalEvent ) : event;
	},

	// Includes some event props shared by KeyEvent and MouseEvent
	props: "altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),

	fixHooks: {},

	keyHooks: {
		props: "char charCode key keyCode".split(" "),
		filter: function( event, original ) {

			// Add which for key events
			if ( event.which == null ) {
				event.which = original.charCode != null ? original.charCode : original.keyCode;
			}

			return event;
		}
	},

	mouseHooks: {
		props: "button buttons clientX clientY fromElement offsetX offsetY pageX pageY screenX screenY toElement".split(" "),
		filter: function( event, original ) {
			var body, eventDoc, doc,
				button = original.button,
				fromElement = original.fromElement;

			// Calculate pageX/Y if missing and clientX/Y available
			if ( event.pageX == null && original.clientX != null ) {
				eventDoc = event.target.ownerDocument || document;
				doc = eventDoc.documentElement;
				body = eventDoc.body;

				event.pageX = original.clientX + ( doc && doc.scrollLeft || body && body.scrollLeft || 0 ) - ( doc && doc.clientLeft || body && body.clientLeft || 0 );
				event.pageY = original.clientY + ( doc && doc.scrollTop  || body && body.scrollTop  || 0 ) - ( doc && doc.clientTop  || body && body.clientTop  || 0 );
			}

			// Add relatedTarget, if necessary
			if ( !event.relatedTarget && fromElement ) {
				event.relatedTarget = fromElement === event.target ? original.toElement : fromElement;
			}

			// Add which for click: 1 === left; 2 === middle; 3 === right
			// Note: button is not normalized, so don't use it
			if ( !event.which && button !== undefined ) {
				event.which = ( button & 1 ? 1 : ( button & 2 ? 3 : ( button & 4 ? 2 : 0 ) ) );
			}

			return event;
		}
	},

	special: {
		load: {
			// Prevent triggered image.load events from bubbling to window.load
			noBubble: true
		},
		focus: {
			// Fire native event if possible so blur/focus sequence is correct
			trigger: function() {
				if ( this !== safeActiveElement() && this.focus ) {
					try {
						this.focus();
						return false;
					} catch ( e ) {
						// Support: IE<9
						// If we error on focus to hidden element (#1486, #12518),
						// let .trigger() run the handlers
					}
				}
			},
			delegateType: "focusin"
		},
		blur: {
			trigger: function() {
				if ( this === safeActiveElement() && this.blur ) {
					this.blur();
					return false;
				}
			},
			delegateType: "focusout"
		},
		click: {
			// For checkbox, fire native event so checked state will be right
			trigger: function() {
				if ( jQuery.nodeName( this, "input" ) && this.type === "checkbox" && this.click ) {
					this.click();
					return false;
				}
			},

			// For cross-browser consistency, don't fire native .click() on links
			_default: function( event ) {
				return jQuery.nodeName( event.target, "a" );
			}
		},

		beforeunload: {
			postDispatch: function( event ) {

				// Support: Firefox 20+
				// Firefox doesn't alert if the returnValue field is not set.
				if ( event.result !== undefined && event.originalEvent ) {
					event.originalEvent.returnValue = event.result;
				}
			}
		}
	},

	simulate: function( type, elem, event, bubble ) {
		// Piggyback on a donor event to simulate a different one.
		// Fake originalEvent to avoid donor's stopPropagation, but if the
		// simulated event prevents default then we do the same on the donor.
		var e = jQuery.extend(
			new jQuery.Event(),
			event,
			{
				type: type,
				isSimulated: true,
				originalEvent: {}
			}
		);
		if ( bubble ) {
			jQuery.event.trigger( e, null, elem );
		} else {
			jQuery.event.dispatch.call( elem, e );
		}
		if ( e.isDefaultPrevented() ) {
			event.preventDefault();
		}
	}
};

jQuery.removeEvent = document.removeEventListener ?
	function( elem, type, handle ) {
		if ( elem.removeEventListener ) {
			elem.removeEventListener( type, handle, false );
		}
	} :
	function( elem, type, handle ) {
		var name = "on" + type;

		if ( elem.detachEvent ) {

			// #8545, #7054, preventing memory leaks for custom events in IE6-8
			// detachEvent needed property on element, by name of that event, to properly expose it to GC
			if ( typeof elem[ name ] === strundefined ) {
				elem[ name ] = null;
			}

			elem.detachEvent( name, handle );
		}
	};

jQuery.Event = function( src, props ) {
	// Allow instantiation without the 'new' keyword
	if ( !(this instanceof jQuery.Event) ) {
		return new jQuery.Event( src, props );
	}

	// Event object
	if ( src && src.type ) {
		this.originalEvent = src;
		this.type = src.type;

		// Events bubbling up the document may have been marked as prevented
		// by a handler lower down the tree; reflect the correct value.
		this.isDefaultPrevented = src.defaultPrevented ||
				src.defaultPrevented === undefined &&
				// Support: IE < 9, Android < 4.0
				src.returnValue === false ?
			returnTrue :
			returnFalse;

	// Event type
	} else {
		this.type = src;
	}

	// Put explicitly provided properties onto the event object
	if ( props ) {
		jQuery.extend( this, props );
	}

	// Create a timestamp if incoming event doesn't have one
	this.timeStamp = src && src.timeStamp || jQuery.now();

	// Mark it as fixed
	this[ jQuery.expando ] = true;
};

// jQuery.Event is based on DOM3 Events as specified by the ECMAScript Language Binding
// http://www.w3.org/TR/2003/WD-DOM-Level-3-Events-20030331/ecma-script-binding.html
jQuery.Event.prototype = {
	isDefaultPrevented: returnFalse,
	isPropagationStopped: returnFalse,
	isImmediatePropagationStopped: returnFalse,

	preventDefault: function() {
		var e = this.originalEvent;

		this.isDefaultPrevented = returnTrue;
		if ( !e ) {
			return;
		}

		// If preventDefault exists, run it on the original event
		if ( e.preventDefault ) {
			e.preventDefault();

		// Support: IE
		// Otherwise set the returnValue property of the original event to false
		} else {
			e.returnValue = false;
		}
	},
	stopPropagation: function() {
		var e = this.originalEvent;

		this.isPropagationStopped = returnTrue;
		if ( !e ) {
			return;
		}
		// If stopPropagation exists, run it on the original event
		if ( e.stopPropagation ) {
			e.stopPropagation();
		}

		// Support: IE
		// Set the cancelBubble property of the original event to true
		e.cancelBubble = true;
	},
	stopImmediatePropagation: function() {
		var e = this.originalEvent;

		this.isImmediatePropagationStopped = returnTrue;

		if ( e && e.stopImmediatePropagation ) {
			e.stopImmediatePropagation();
		}

		this.stopPropagation();
	}
};

// Create mouseenter/leave events using mouseover/out and event-time checks
jQuery.each({
	mouseenter: "mouseover",
	mouseleave: "mouseout",
	pointerenter: "pointerover",
	pointerleave: "pointerout"
}, function( orig, fix ) {
	jQuery.event.special[ orig ] = {
		delegateType: fix,
		bindType: fix,

		handle: function( event ) {
			var ret,
				target = this,
				related = event.relatedTarget,
				handleObj = event.handleObj;

			// For mousenter/leave call the handler if related is outside the target.
			// NB: No relatedTarget if the mouse left/entered the browser window
			if ( !related || (related !== target && !jQuery.contains( target, related )) ) {
				event.type = handleObj.origType;
				ret = handleObj.handler.apply( this, arguments );
				event.type = fix;
			}
			return ret;
		}
	};
});

// IE submit delegation
if ( !support.submitBubbles ) {

	jQuery.event.special.submit = {
		setup: function() {
			// Only need this for delegated form submit events
			if ( jQuery.nodeName( this, "form" ) ) {
				return false;
			}

			// Lazy-add a submit handler when a descendant form may potentially be submitted
			jQuery.event.add( this, "click._submit keypress._submit", function( e ) {
				// Node name check avoids a VML-related crash in IE (#9807)
				var elem = e.target,
					form = jQuery.nodeName( elem, "input" ) || jQuery.nodeName( elem, "button" ) ? elem.form : undefined;
				if ( form && !jQuery._data( form, "submitBubbles" ) ) {
					jQuery.event.add( form, "submit._submit", function( event ) {
						event._submit_bubble = true;
					});
					jQuery._data( form, "submitBubbles", true );
				}
			});
			// return undefined since we don't need an event listener
		},

		postDispatch: function( event ) {
			// If form was submitted by the user, bubble the event up the tree
			if ( event._submit_bubble ) {
				delete event._submit_bubble;
				if ( this.parentNode && !event.isTrigger ) {
					jQuery.event.simulate( "submit", this.parentNode, event, true );
				}
			}
		},

		teardown: function() {
			// Only need this for delegated form submit events
			if ( jQuery.nodeName( this, "form" ) ) {
				return false;
			}

			// Remove delegated handlers; cleanData eventually reaps submit handlers attached above
			jQuery.event.remove( this, "._submit" );
		}
	};
}

// IE change delegation and checkbox/radio fix
if ( !support.changeBubbles ) {

	jQuery.event.special.change = {

		setup: function() {

			if ( rformElems.test( this.nodeName ) ) {
				// IE doesn't fire change on a check/radio until blur; trigger it on click
				// after a propertychange. Eat the blur-change in special.change.handle.
				// This still fires onchange a second time for check/radio after blur.
				if ( this.type === "checkbox" || this.type === "radio" ) {
					jQuery.event.add( this, "propertychange._change", function( event ) {
						if ( event.originalEvent.propertyName === "checked" ) {
							this._just_changed = true;
						}
					});
					jQuery.event.add( this, "click._change", function( event ) {
						if ( this._just_changed && !event.isTrigger ) {
							this._just_changed = false;
						}
						// Allow triggered, simulated change events (#11500)
						jQuery.event.simulate( "change", this, event, true );
					});
				}
				return false;
			}
			// Delegated event; lazy-add a change handler on descendant inputs
			jQuery.event.add( this, "beforeactivate._change", function( e ) {
				var elem = e.target;

				if ( rformElems.test( elem.nodeName ) && !jQuery._data( elem, "changeBubbles" ) ) {
					jQuery.event.add( elem, "change._change", function( event ) {
						if ( this.parentNode && !event.isSimulated && !event.isTrigger ) {
							jQuery.event.simulate( "change", this.parentNode, event, true );
						}
					});
					jQuery._data( elem, "changeBubbles", true );
				}
			});
		},

		handle: function( event ) {
			var elem = event.target;

			// Swallow native change events from checkbox/radio, we already triggered them above
			if ( this !== elem || event.isSimulated || event.isTrigger || (elem.type !== "radio" && elem.type !== "checkbox") ) {
				return event.handleObj.handler.apply( this, arguments );
			}
		},

		teardown: function() {
			jQuery.event.remove( this, "._change" );

			return !rformElems.test( this.nodeName );
		}
	};
}

// Create "bubbling" focus and blur events
if ( !support.focusinBubbles ) {
	jQuery.each({ focus: "focusin", blur: "focusout" }, function( orig, fix ) {

		// Attach a single capturing handler on the document while someone wants focusin/focusout
		var handler = function( event ) {
				jQuery.event.simulate( fix, event.target, jQuery.event.fix( event ), true );
			};

		jQuery.event.special[ fix ] = {
			setup: function() {
				var doc = this.ownerDocument || this,
					attaches = jQuery._data( doc, fix );

				if ( !attaches ) {
					doc.addEventListener( orig, handler, true );
				}
				jQuery._data( doc, fix, ( attaches || 0 ) + 1 );
			},
			teardown: function() {
				var doc = this.ownerDocument || this,
					attaches = jQuery._data( doc, fix ) - 1;

				if ( !attaches ) {
					doc.removeEventListener( orig, handler, true );
					jQuery._removeData( doc, fix );
				} else {
					jQuery._data( doc, fix, attaches );
				}
			}
		};
	});
}

jQuery.fn.extend({

	on: function( types, selector, data, fn, /*INTERNAL*/ one ) {
		var type, origFn;

		// Types can be a map of types/handlers
		if ( typeof types === "object" ) {
			// ( types-Object, selector, data )
			if ( typeof selector !== "string" ) {
				// ( types-Object, data )
				data = data || selector;
				selector = undefined;
			}
			for ( type in types ) {
				this.on( type, selector, data, types[ type ], one );
			}
			return this;
		}

		if ( data == null && fn == null ) {
			// ( types, fn )
			fn = selector;
			data = selector = undefined;
		} else if ( fn == null ) {
			if ( typeof selector === "string" ) {
				// ( types, selector, fn )
				fn = data;
				data = undefined;
			} else {
				// ( types, data, fn )
				fn = data;
				data = selector;
				selector = undefined;
			}
		}
		if ( fn === false ) {
			fn = returnFalse;
		} else if ( !fn ) {
			return this;
		}

		if ( one === 1 ) {
			origFn = fn;
			fn = function( event ) {
				// Can use an empty set, since event contains the info
				jQuery().off( event );
				return origFn.apply( this, arguments );
			};
			// Use same guid so caller can remove using origFn
			fn.guid = origFn.guid || ( origFn.guid = jQuery.guid++ );
		}
		return this.each( function() {
			jQuery.event.add( this, types, fn, data, selector );
		});
	},
	one: function( types, selector, data, fn ) {
		return this.on( types, selector, data, fn, 1 );
	},
	off: function( types, selector, fn ) {
		var handleObj, type;
		if ( types && types.preventDefault && types.handleObj ) {
			// ( event )  dispatched jQuery.Event
			handleObj = types.handleObj;
			jQuery( types.delegateTarget ).off(
				handleObj.namespace ? handleObj.origType + "." + handleObj.namespace : handleObj.origType,
				handleObj.selector,
				handleObj.handler
			);
			return this;
		}
		if ( typeof types === "object" ) {
			// ( types-object [, selector] )
			for ( type in types ) {
				this.off( type, selector, types[ type ] );
			}
			return this;
		}
		if ( selector === false || typeof selector === "function" ) {
			// ( types [, fn] )
			fn = selector;
			selector = undefined;
		}
		if ( fn === false ) {
			fn = returnFalse;
		}
		return this.each(function() {
			jQuery.event.remove( this, types, fn, selector );
		});
	},

	trigger: function( type, data ) {
		return this.each(function() {
			jQuery.event.trigger( type, data, this );
		});
	},
	triggerHandler: function( type, data ) {
		var elem = this[0];
		if ( elem ) {
			return jQuery.event.trigger( type, data, elem, true );
		}
	}
});


function createSafeFragment( document ) {
	var list = nodeNames.split( "|" ),
		safeFrag = document.createDocumentFragment();

	if ( safeFrag.createElement ) {
		while ( list.length ) {
			safeFrag.createElement(
				list.pop()
			);
		}
	}
	return safeFrag;
}

var nodeNames = "abbr|article|aside|audio|bdi|canvas|data|datalist|details|figcaption|figure|footer|" +
		"header|hgroup|mark|meter|nav|output|progress|section|summary|time|video",
	rinlinejQuery = / jQuery\d+="(?:null|\d+)"/g,
	rnoshimcache = new RegExp("<(?:" + nodeNames + ")[\\s/>]", "i"),
	rleadingWhitespace = /^\s+/,
	rxhtmlTag = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi,
	rtagName = /<([\w:]+)/,
	rtbody = /<tbody/i,
	rhtml = /<|&#?\w+;/,
	rnoInnerhtml = /<(?:script|style|link)/i,
	// checked="checked" or checked
	rchecked = /checked\s*(?:[^=]|=\s*.checked.)/i,
	rscriptType = /^$|\/(?:java|ecma)script/i,
	rscriptTypeMasked = /^true\/(.*)/,
	rcleanScript = /^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g,

	// We have to close these tags to support XHTML (#13200)
	wrapMap = {
		option: [ 1, "<select multiple='multiple'>", "</select>" ],
		legend: [ 1, "<fieldset>", "</fieldset>" ],
		area: [ 1, "<map>", "</map>" ],
		param: [ 1, "<object>", "</object>" ],
		thead: [ 1, "<table>", "</table>" ],
		tr: [ 2, "<table><tbody>", "</tbody></table>" ],
		col: [ 2, "<table><tbody></tbody><colgroup>", "</colgroup></table>" ],
		td: [ 3, "<table><tbody><tr>", "</tr></tbody></table>" ],

		// IE6-8 can't serialize link, script, style, or any html5 (NoScope) tags,
		// unless wrapped in a div with non-breaking characters in front of it.
		_default: support.htmlSerialize ? [ 0, "", "" ] : [ 1, "X<div>", "</div>"  ]
	},
	safeFragment = createSafeFragment( document ),
	fragmentDiv = safeFragment.appendChild( document.createElement("div") );

wrapMap.optgroup = wrapMap.option;
wrapMap.tbody = wrapMap.tfoot = wrapMap.colgroup = wrapMap.caption = wrapMap.thead;
wrapMap.th = wrapMap.td;

function getAll( context, tag ) {
	var elems, elem,
		i = 0,
		found = typeof context.getElementsByTagName !== strundefined ? context.getElementsByTagName( tag || "*" ) :
			typeof context.querySelectorAll !== strundefined ? context.querySelectorAll( tag || "*" ) :
			undefined;

	if ( !found ) {
		for ( found = [], elems = context.childNodes || context; (elem = elems[i]) != null; i++ ) {
			if ( !tag || jQuery.nodeName( elem, tag ) ) {
				found.push( elem );
			} else {
				jQuery.merge( found, getAll( elem, tag ) );
			}
		}
	}

	return tag === undefined || tag && jQuery.nodeName( context, tag ) ?
		jQuery.merge( [ context ], found ) :
		found;
}

// Used in buildFragment, fixes the defaultChecked property
function fixDefaultChecked( elem ) {
	if ( rcheckableType.test( elem.type ) ) {
		elem.defaultChecked = elem.checked;
	}
}

// Support: IE<8
// Manipulating tables requires a tbody
function manipulationTarget( elem, content ) {
	return jQuery.nodeName( elem, "table" ) &&
		jQuery.nodeName( content.nodeType !== 11 ? content : content.firstChild, "tr" ) ?

		elem.getElementsByTagName("tbody")[0] ||
			elem.appendChild( elem.ownerDocument.createElement("tbody") ) :
		elem;
}

// Replace/restore the type attribute of script elements for safe DOM manipulation
function disableScript( elem ) {
	elem.type = (jQuery.find.attr( elem, "type" ) !== null) + "/" + elem.type;
	return elem;
}
function restoreScript( elem ) {
	var match = rscriptTypeMasked.exec( elem.type );
	if ( match ) {
		elem.type = match[1];
	} else {
		elem.removeAttribute("type");
	}
	return elem;
}

// Mark scripts as having already been evaluated
function setGlobalEval( elems, refElements ) {
	var elem,
		i = 0;
	for ( ; (elem = elems[i]) != null; i++ ) {
		jQuery._data( elem, "globalEval", !refElements || jQuery._data( refElements[i], "globalEval" ) );
	}
}

function cloneCopyEvent( src, dest ) {

	if ( dest.nodeType !== 1 || !jQuery.hasData( src ) ) {
		return;
	}

	var type, i, l,
		oldData = jQuery._data( src ),
		curData = jQuery._data( dest, oldData ),
		events = oldData.events;

	if ( events ) {
		delete curData.handle;
		curData.events = {};

		for ( type in events ) {
			for ( i = 0, l = events[ type ].length; i < l; i++ ) {
				jQuery.event.add( dest, type, events[ type ][ i ] );
			}
		}
	}

	// make the cloned public data object a copy from the original
	if ( curData.data ) {
		curData.data = jQuery.extend( {}, curData.data );
	}
}

function fixCloneNodeIssues( src, dest ) {
	var nodeName, e, data;

	// We do not need to do anything for non-Elements
	if ( dest.nodeType !== 1 ) {
		return;
	}

	nodeName = dest.nodeName.toLowerCase();

	// IE6-8 copies events bound via attachEvent when using cloneNode.
	if ( !support.noCloneEvent && dest[ jQuery.expando ] ) {
		data = jQuery._data( dest );

		for ( e in data.events ) {
			jQuery.removeEvent( dest, e, data.handle );
		}

		// Event data gets referenced instead of copied if the expando gets copied too
		dest.removeAttribute( jQuery.expando );
	}

	// IE blanks contents when cloning scripts, and tries to evaluate newly-set text
	if ( nodeName === "script" && dest.text !== src.text ) {
		disableScript( dest ).text = src.text;
		restoreScript( dest );

	// IE6-10 improperly clones children of object elements using classid.
	// IE10 throws NoModificationAllowedError if parent is null, #12132.
	} else if ( nodeName === "object" ) {
		if ( dest.parentNode ) {
			dest.outerHTML = src.outerHTML;
		}

		// This path appears unavoidable for IE9. When cloning an object
		// element in IE9, the outerHTML strategy above is not sufficient.
		// If the src has innerHTML and the destination does not,
		// copy the src.innerHTML into the dest.innerHTML. #10324
		if ( support.html5Clone && ( src.innerHTML && !jQuery.trim(dest.innerHTML) ) ) {
			dest.innerHTML = src.innerHTML;
		}

	} else if ( nodeName === "input" && rcheckableType.test( src.type ) ) {
		// IE6-8 fails to persist the checked state of a cloned checkbox
		// or radio button. Worse, IE6-7 fail to give the cloned element
		// a checked appearance if the defaultChecked value isn't also set

		dest.defaultChecked = dest.checked = src.checked;

		// IE6-7 get confused and end up setting the value of a cloned
		// checkbox/radio button to an empty string instead of "on"
		if ( dest.value !== src.value ) {
			dest.value = src.value;
		}

	// IE6-8 fails to return the selected option to the default selected
	// state when cloning options
	} else if ( nodeName === "option" ) {
		dest.defaultSelected = dest.selected = src.defaultSelected;

	// IE6-8 fails to set the defaultValue to the correct value when
	// cloning other types of input fields
	} else if ( nodeName === "input" || nodeName === "textarea" ) {
		dest.defaultValue = src.defaultValue;
	}
}

jQuery.extend({
	clone: function( elem, dataAndEvents, deepDataAndEvents ) {
		var destElements, node, clone, i, srcElements,
			inPage = jQuery.contains( elem.ownerDocument, elem );

		if ( support.html5Clone || jQuery.isXMLDoc(elem) || !rnoshimcache.test( "<" + elem.nodeName + ">" ) ) {
			clone = elem.cloneNode( true );

		// IE<=8 does not properly clone detached, unknown element nodes
		} else {
			fragmentDiv.innerHTML = elem.outerHTML;
			fragmentDiv.removeChild( clone = fragmentDiv.firstChild );
		}

		if ( (!support.noCloneEvent || !support.noCloneChecked) &&
				(elem.nodeType === 1 || elem.nodeType === 11) && !jQuery.isXMLDoc(elem) ) {

			// We eschew Sizzle here for performance reasons: http://jsperf.com/getall-vs-sizzle/2
			destElements = getAll( clone );
			srcElements = getAll( elem );

			// Fix all IE cloning issues
			for ( i = 0; (node = srcElements[i]) != null; ++i ) {
				// Ensure that the destination node is not null; Fixes #9587
				if ( destElements[i] ) {
					fixCloneNodeIssues( node, destElements[i] );
				}
			}
		}

		// Copy the events from the original to the clone
		if ( dataAndEvents ) {
			if ( deepDataAndEvents ) {
				srcElements = srcElements || getAll( elem );
				destElements = destElements || getAll( clone );

				for ( i = 0; (node = srcElements[i]) != null; i++ ) {
					cloneCopyEvent( node, destElements[i] );
				}
			} else {
				cloneCopyEvent( elem, clone );
			}
		}

		// Preserve script evaluation history
		destElements = getAll( clone, "script" );
		if ( destElements.length > 0 ) {
			setGlobalEval( destElements, !inPage && getAll( elem, "script" ) );
		}

		destElements = srcElements = node = null;

		// Return the cloned set
		return clone;
	},

	buildFragment: function( elems, context, scripts, selection ) {
		var j, elem, contains,
			tmp, tag, tbody, wrap,
			l = elems.length,

			// Ensure a safe fragment
			safe = createSafeFragment( context ),

			nodes = [],
			i = 0;

		for ( ; i < l; i++ ) {
			elem = elems[ i ];

			if ( elem || elem === 0 ) {

				// Add nodes directly
				if ( jQuery.type( elem ) === "object" ) {
					jQuery.merge( nodes, elem.nodeType ? [ elem ] : elem );

				// Convert non-html into a text node
				} else if ( !rhtml.test( elem ) ) {
					nodes.push( context.createTextNode( elem ) );

				// Convert html into DOM nodes
				} else {
					tmp = tmp || safe.appendChild( context.createElement("div") );

					// Deserialize a standard representation
					tag = (rtagName.exec( elem ) || [ "", "" ])[ 1 ].toLowerCase();
					wrap = wrapMap[ tag ] || wrapMap._default;

					tmp.innerHTML = wrap[1] + elem.replace( rxhtmlTag, "<$1></$2>" ) + wrap[2];

					// Descend through wrappers to the right content
					j = wrap[0];
					while ( j-- ) {
						tmp = tmp.lastChild;
					}

					// Manually add leading whitespace removed by IE
					if ( !support.leadingWhitespace && rleadingWhitespace.test( elem ) ) {
						nodes.push( context.createTextNode( rleadingWhitespace.exec( elem )[0] ) );
					}

					// Remove IE's autoinserted <tbody> from table fragments
					if ( !support.tbody ) {

						// String was a <table>, *may* have spurious <tbody>
						elem = tag === "table" && !rtbody.test( elem ) ?
							tmp.firstChild :

							// String was a bare <thead> or <tfoot>
							wrap[1] === "<table>" && !rtbody.test( elem ) ?
								tmp :
								0;

						j = elem && elem.childNodes.length;
						while ( j-- ) {
							if ( jQuery.nodeName( (tbody = elem.childNodes[j]), "tbody" ) && !tbody.childNodes.length ) {
								elem.removeChild( tbody );
							}
						}
					}

					jQuery.merge( nodes, tmp.childNodes );

					// Fix #12392 for WebKit and IE > 9
					tmp.textContent = "";

					// Fix #12392 for oldIE
					while ( tmp.firstChild ) {
						tmp.removeChild( tmp.firstChild );
					}

					// Remember the top-level container for proper cleanup
					tmp = safe.lastChild;
				}
			}
		}

		// Fix #11356: Clear elements from fragment
		if ( tmp ) {
			safe.removeChild( tmp );
		}

		// Reset defaultChecked for any radios and checkboxes
		// about to be appended to the DOM in IE 6/7 (#8060)
		if ( !support.appendChecked ) {
			jQuery.grep( getAll( nodes, "input" ), fixDefaultChecked );
		}

		i = 0;
		while ( (elem = nodes[ i++ ]) ) {

			// #4087 - If origin and destination elements are the same, and this is
			// that element, do not do anything
			if ( selection && jQuery.inArray( elem, selection ) !== -1 ) {
				continue;
			}

			contains = jQuery.contains( elem.ownerDocument, elem );

			// Append to fragment
			tmp = getAll( safe.appendChild( elem ), "script" );

			// Preserve script evaluation history
			if ( contains ) {
				setGlobalEval( tmp );
			}

			// Capture executables
			if ( scripts ) {
				j = 0;
				while ( (elem = tmp[ j++ ]) ) {
					if ( rscriptType.test( elem.type || "" ) ) {
						scripts.push( elem );
					}
				}
			}
		}

		tmp = null;

		return safe;
	},

	cleanData: function( elems, /* internal */ acceptData ) {
		var elem, type, id, data,
			i = 0,
			internalKey = jQuery.expando,
			cache = jQuery.cache,
			deleteExpando = support.deleteExpando,
			special = jQuery.event.special;

		for ( ; (elem = elems[i]) != null; i++ ) {
			if ( acceptData || jQuery.acceptData( elem ) ) {

				id = elem[ internalKey ];
				data = id && cache[ id ];

				if ( data ) {
					if ( data.events ) {
						for ( type in data.events ) {
							if ( special[ type ] ) {
								jQuery.event.remove( elem, type );

							// This is a shortcut to avoid jQuery.event.remove's overhead
							} else {
								jQuery.removeEvent( elem, type, data.handle );
							}
						}
					}

					// Remove cache only if it was not already removed by jQuery.event.remove
					if ( cache[ id ] ) {

						delete cache[ id ];

						// IE does not allow us to delete expando properties from nodes,
						// nor does it have a removeAttribute function on Document nodes;
						// we must handle all of these cases
						if ( deleteExpando ) {
							delete elem[ internalKey ];

						} else if ( typeof elem.removeAttribute !== strundefined ) {
							elem.removeAttribute( internalKey );

						} else {
							elem[ internalKey ] = null;
						}

						deletedIds.push( id );
					}
				}
			}
		}
	}
});

jQuery.fn.extend({
	text: function( value ) {
		return access( this, function( value ) {
			return value === undefined ?
				jQuery.text( this ) :
				this.empty().append( ( this[0] && this[0].ownerDocument || document ).createTextNode( value ) );
		}, null, value, arguments.length );
	},

	append: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				var target = manipulationTarget( this, elem );
				target.appendChild( elem );
			}
		});
	},

	prepend: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				var target = manipulationTarget( this, elem );
				target.insertBefore( elem, target.firstChild );
			}
		});
	},

	before: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this );
			}
		});
	},

	after: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this.nextSibling );
			}
		});
	},

	remove: function( selector, keepData /* Internal Use Only */ ) {
		var elem,
			elems = selector ? jQuery.filter( selector, this ) : this,
			i = 0;

		for ( ; (elem = elems[i]) != null; i++ ) {

			if ( !keepData && elem.nodeType === 1 ) {
				jQuery.cleanData( getAll( elem ) );
			}

			if ( elem.parentNode ) {
				if ( keepData && jQuery.contains( elem.ownerDocument, elem ) ) {
					setGlobalEval( getAll( elem, "script" ) );
				}
				elem.parentNode.removeChild( elem );
			}
		}

		return this;
	},

	empty: function() {
		var elem,
			i = 0;

		for ( ; (elem = this[i]) != null; i++ ) {
			// Remove element nodes and prevent memory leaks
			if ( elem.nodeType === 1 ) {
				jQuery.cleanData( getAll( elem, false ) );
			}

			// Remove any remaining nodes
			while ( elem.firstChild ) {
				elem.removeChild( elem.firstChild );
			}

			// If this is a select, ensure that it displays empty (#12336)
			// Support: IE<9
			if ( elem.options && jQuery.nodeName( elem, "select" ) ) {
				elem.options.length = 0;
			}
		}

		return this;
	},

	clone: function( dataAndEvents, deepDataAndEvents ) {
		dataAndEvents = dataAndEvents == null ? false : dataAndEvents;
		deepDataAndEvents = deepDataAndEvents == null ? dataAndEvents : deepDataAndEvents;

		return this.map(function() {
			return jQuery.clone( this, dataAndEvents, deepDataAndEvents );
		});
	},

	html: function( value ) {
		return access( this, function( value ) {
			var elem = this[ 0 ] || {},
				i = 0,
				l = this.length;

			if ( value === undefined ) {
				return elem.nodeType === 1 ?
					elem.innerHTML.replace( rinlinejQuery, "" ) :
					undefined;
			}

			// See if we can take a shortcut and just use innerHTML
			if ( typeof value === "string" && !rnoInnerhtml.test( value ) &&
				( support.htmlSerialize || !rnoshimcache.test( value )  ) &&
				( support.leadingWhitespace || !rleadingWhitespace.test( value ) ) &&
				!wrapMap[ (rtagName.exec( value ) || [ "", "" ])[ 1 ].toLowerCase() ] ) {

				value = value.replace( rxhtmlTag, "<$1></$2>" );

				try {
					for (; i < l; i++ ) {
						// Remove element nodes and prevent memory leaks
						elem = this[i] || {};
						if ( elem.nodeType === 1 ) {
							jQuery.cleanData( getAll( elem, false ) );
							elem.innerHTML = value;
						}
					}

					elem = 0;

				// If using innerHTML throws an exception, use the fallback method
				} catch(e) {}
			}

			if ( elem ) {
				this.empty().append( value );
			}
		}, null, value, arguments.length );
	},

	replaceWith: function() {
		var arg = arguments[ 0 ];

		// Make the changes, replacing each context element with the new content
		this.domManip( arguments, function( elem ) {
			arg = this.parentNode;

			jQuery.cleanData( getAll( this ) );

			if ( arg ) {
				arg.replaceChild( elem, this );
			}
		});

		// Force removal if there was no new content (e.g., from empty arguments)
		return arg && (arg.length || arg.nodeType) ? this : this.remove();
	},

	detach: function( selector ) {
		return this.remove( selector, true );
	},

	domManip: function( args, callback ) {

		// Flatten any nested arrays
		args = concat.apply( [], args );

		var first, node, hasScripts,
			scripts, doc, fragment,
			i = 0,
			l = this.length,
			set = this,
			iNoClone = l - 1,
			value = args[0],
			isFunction = jQuery.isFunction( value );

		// We can't cloneNode fragments that contain checked, in WebKit
		if ( isFunction ||
				( l > 1 && typeof value === "string" &&
					!support.checkClone && rchecked.test( value ) ) ) {
			return this.each(function( index ) {
				var self = set.eq( index );
				if ( isFunction ) {
					args[0] = value.call( this, index, self.html() );
				}
				self.domManip( args, callback );
			});
		}

		if ( l ) {
			fragment = jQuery.buildFragment( args, this[ 0 ].ownerDocument, false, this );
			first = fragment.firstChild;

			if ( fragment.childNodes.length === 1 ) {
				fragment = first;
			}

			if ( first ) {
				scripts = jQuery.map( getAll( fragment, "script" ), disableScript );
				hasScripts = scripts.length;

				// Use the original fragment for the last item instead of the first because it can end up
				// being emptied incorrectly in certain situations (#8070).
				for ( ; i < l; i++ ) {
					node = fragment;

					if ( i !== iNoClone ) {
						node = jQuery.clone( node, true, true );

						// Keep references to cloned scripts for later restoration
						if ( hasScripts ) {
							jQuery.merge( scripts, getAll( node, "script" ) );
						}
					}

					callback.call( this[i], node, i );
				}

				if ( hasScripts ) {
					doc = scripts[ scripts.length - 1 ].ownerDocument;

					// Reenable scripts
					jQuery.map( scripts, restoreScript );

					// Evaluate executable scripts on first document insertion
					for ( i = 0; i < hasScripts; i++ ) {
						node = scripts[ i ];
						if ( rscriptType.test( node.type || "" ) &&
							!jQuery._data( node, "globalEval" ) && jQuery.contains( doc, node ) ) {

							if ( node.src ) {
								// Optional AJAX dependency, but won't run scripts if not present
								if ( jQuery._evalUrl ) {
									jQuery._evalUrl( node.src );
								}
							} else {
								jQuery.globalEval( ( node.text || node.textContent || node.innerHTML || "" ).replace( rcleanScript, "" ) );
							}
						}
					}
				}

				// Fix #11809: Avoid leaking memory
				fragment = first = null;
			}
		}

		return this;
	}
});

jQuery.each({
	appendTo: "append",
	prependTo: "prepend",
	insertBefore: "before",
	insertAfter: "after",
	replaceAll: "replaceWith"
}, function( name, original ) {
	jQuery.fn[ name ] = function( selector ) {
		var elems,
			i = 0,
			ret = [],
			insert = jQuery( selector ),
			last = insert.length - 1;

		for ( ; i <= last; i++ ) {
			elems = i === last ? this : this.clone(true);
			jQuery( insert[i] )[ original ]( elems );

			// Modern browsers can apply jQuery collections as arrays, but oldIE needs a .get()
			push.apply( ret, elems.get() );
		}

		return this.pushStack( ret );
	};
});


var iframe,
	elemdisplay = {};

/**
 * Retrieve the actual display of a element
 * @param {String} name nodeName of the element
 * @param {Object} doc Document object
 */
// Called only from within defaultDisplay
function actualDisplay( name, doc ) {
	var style,
		elem = jQuery( doc.createElement( name ) ).appendTo( doc.body ),

		// getDefaultComputedStyle might be reliably used only on attached element
		display = window.getDefaultComputedStyle && ( style = window.getDefaultComputedStyle( elem[ 0 ] ) ) ?

			// Use of this method is a temporary fix (more like optmization) until something better comes along,
			// since it was removed from specification and supported only in FF
			style.display : jQuery.css( elem[ 0 ], "display" );

	// We don't have any data stored on the element,
	// so use "detach" method as fast way to get rid of the element
	elem.detach();

	return display;
}

/**
 * Try to determine the default display value of an element
 * @param {String} nodeName
 */
function defaultDisplay( nodeName ) {
	var doc = document,
		display = elemdisplay[ nodeName ];

	if ( !display ) {
		display = actualDisplay( nodeName, doc );

		// If the simple way fails, read from inside an iframe
		if ( display === "none" || !display ) {

			// Use the already-created iframe if possible
			iframe = (iframe || jQuery( "<iframe frameborder='0' width='0' height='0'/>" )).appendTo( doc.documentElement );

			// Always write a new HTML skeleton so Webkit and Firefox don't choke on reuse
			doc = ( iframe[ 0 ].contentWindow || iframe[ 0 ].contentDocument ).document;

			// Support: IE
			doc.write();
			doc.close();

			display = actualDisplay( nodeName, doc );
			iframe.detach();
		}

		// Store the correct default display
		elemdisplay[ nodeName ] = display;
	}

	return display;
}


(function() {
	var shrinkWrapBlocksVal;

	support.shrinkWrapBlocks = function() {
		if ( shrinkWrapBlocksVal != null ) {
			return shrinkWrapBlocksVal;
		}

		// Will be changed later if needed.
		shrinkWrapBlocksVal = false;

		// Minified: var b,c,d
		var div, body, container;

		body = document.getElementsByTagName( "body" )[ 0 ];
		if ( !body || !body.style ) {
			// Test fired too early or in an unsupported environment, exit.
			return;
		}

		// Setup
		div = document.createElement( "div" );
		container = document.createElement( "div" );
		container.style.cssText = "position:absolute;border:0;width:0;height:0;top:0;left:-9999px";
		body.appendChild( container ).appendChild( div );

		// Support: IE6
		// Check if elements with layout shrink-wrap their children
		if ( typeof div.style.zoom !== strundefined ) {
			// Reset CSS: box-sizing; display; margin; border
			div.style.cssText =
				// Support: Firefox<29, Android 2.3
				// Vendor-prefix box-sizing
				"-webkit-box-sizing:content-box;-moz-box-sizing:content-box;" +
				"box-sizing:content-box;display:block;margin:0;border:0;" +
				"padding:1px;width:1px;zoom:1";
			div.appendChild( document.createElement( "div" ) ).style.width = "5px";
			shrinkWrapBlocksVal = div.offsetWidth !== 3;
		}

		body.removeChild( container );

		return shrinkWrapBlocksVal;
	};

})();
var rmargin = (/^margin/);

var rnumnonpx = new RegExp( "^(" + pnum + ")(?!px)[a-z%]+$", "i" );



var getStyles, curCSS,
	rposition = /^(top|right|bottom|left)$/;

if ( window.getComputedStyle ) {
	getStyles = function( elem ) {
		// Support: IE<=11+, Firefox<=30+ (#15098, #14150)
		// IE throws on elements created in popups
		// FF meanwhile throws on frame elements through "defaultView.getComputedStyle"
		if ( elem.ownerDocument.defaultView.opener ) {
			return elem.ownerDocument.defaultView.getComputedStyle( elem, null );
		}

		return window.getComputedStyle( elem, null );
	};

	curCSS = function( elem, name, computed ) {
		var width, minWidth, maxWidth, ret,
			style = elem.style;

		computed = computed || getStyles( elem );

		// getPropertyValue is only needed for .css('filter') in IE9, see #12537
		ret = computed ? computed.getPropertyValue( name ) || computed[ name ] : undefined;

		if ( computed ) {

			if ( ret === "" && !jQuery.contains( elem.ownerDocument, elem ) ) {
				ret = jQuery.style( elem, name );
			}

			// A tribute to the "awesome hack by Dean Edwards"
			// Chrome < 17 and Safari 5.0 uses "computed value" instead of "used value" for margin-right
			// Safari 5.1.7 (at least) returns percentage for a larger set of values, but width seems to be reliably pixels
			// this is against the CSSOM draft spec: http://dev.w3.org/csswg/cssom/#resolved-values
			if ( rnumnonpx.test( ret ) && rmargin.test( name ) ) {

				// Remember the original values
				width = style.width;
				minWidth = style.minWidth;
				maxWidth = style.maxWidth;

				// Put in the new values to get a computed value out
				style.minWidth = style.maxWidth = style.width = ret;
				ret = computed.width;

				// Revert the changed values
				style.width = width;
				style.minWidth = minWidth;
				style.maxWidth = maxWidth;
			}
		}

		// Support: IE
		// IE returns zIndex value as an integer.
		return ret === undefined ?
			ret :
			ret + "";
	};
} else if ( document.documentElement.currentStyle ) {
	getStyles = function( elem ) {
		return elem.currentStyle;
	};

	curCSS = function( elem, name, computed ) {
		var left, rs, rsLeft, ret,
			style = elem.style;

		computed = computed || getStyles( elem );
		ret = computed ? computed[ name ] : undefined;

		// Avoid setting ret to empty string here
		// so we don't default to auto
		if ( ret == null && style && style[ name ] ) {
			ret = style[ name ];
		}

		// From the awesome hack by Dean Edwards
		// http://erik.eae.net/archives/2007/07/27/18.54.15/#comment-102291

		// If we're not dealing with a regular pixel number
		// but a number that has a weird ending, we need to convert it to pixels
		// but not position css attributes, as those are proportional to the parent element instead
		// and we can't measure the parent instead because it might trigger a "stacking dolls" problem
		if ( rnumnonpx.test( ret ) && !rposition.test( name ) ) {

			// Remember the original values
			left = style.left;
			rs = elem.runtimeStyle;
			rsLeft = rs && rs.left;

			// Put in the new values to get a computed value out
			if ( rsLeft ) {
				rs.left = elem.currentStyle.left;
			}
			style.left = name === "fontSize" ? "1em" : ret;
			ret = style.pixelLeft + "px";

			// Revert the changed values
			style.left = left;
			if ( rsLeft ) {
				rs.left = rsLeft;
			}
		}

		// Support: IE
		// IE returns zIndex value as an integer.
		return ret === undefined ?
			ret :
			ret + "" || "auto";
	};
}




function addGetHookIf( conditionFn, hookFn ) {
	// Define the hook, we'll check on the first run if it's really needed.
	return {
		get: function() {
			var condition = conditionFn();

			if ( condition == null ) {
				// The test was not ready at this point; screw the hook this time
				// but check again when needed next time.
				return;
			}

			if ( condition ) {
				// Hook not needed (or it's not possible to use it due to missing dependency),
				// remove it.
				// Since there are no other hooks for marginRight, remove the whole object.
				delete this.get;
				return;
			}

			// Hook needed; redefine it so that the support test is not executed again.

			return (this.get = hookFn).apply( this, arguments );
		}
	};
}


(function() {
	// Minified: var b,c,d,e,f,g, h,i
	var div, style, a, pixelPositionVal, boxSizingReliableVal,
		reliableHiddenOffsetsVal, reliableMarginRightVal;

	// Setup
	div = document.createElement( "div" );
	div.innerHTML = "  <link/><table></table><a href='/a'>a</a><input type='checkbox'/>";
	a = div.getElementsByTagName( "a" )[ 0 ];
	style = a && a.style;

	// Finish early in limited (non-browser) environments
	if ( !style ) {
		return;
	}

	style.cssText = "float:left;opacity:.5";

	// Support: IE<9
	// Make sure that element opacity exists (as opposed to filter)
	support.opacity = style.opacity === "0.5";

	// Verify style float existence
	// (IE uses styleFloat instead of cssFloat)
	support.cssFloat = !!style.cssFloat;

	div.style.backgroundClip = "content-box";
	div.cloneNode( true ).style.backgroundClip = "";
	support.clearCloneStyle = div.style.backgroundClip === "content-box";

	// Support: Firefox<29, Android 2.3
	// Vendor-prefix box-sizing
	support.boxSizing = style.boxSizing === "" || style.MozBoxSizing === "" ||
		style.WebkitBoxSizing === "";

	jQuery.extend(support, {
		reliableHiddenOffsets: function() {
			if ( reliableHiddenOffsetsVal == null ) {
				computeStyleTests();
			}
			return reliableHiddenOffsetsVal;
		},

		boxSizingReliable: function() {
			if ( boxSizingReliableVal == null ) {
				computeStyleTests();
			}
			return boxSizingReliableVal;
		},

		pixelPosition: function() {
			if ( pixelPositionVal == null ) {
				computeStyleTests();
			}
			return pixelPositionVal;
		},

		// Support: Android 2.3
		reliableMarginRight: function() {
			if ( reliableMarginRightVal == null ) {
				computeStyleTests();
			}
			return reliableMarginRightVal;
		}
	});

	function computeStyleTests() {
		// Minified: var b,c,d,j
		var div, body, container, contents;

		body = document.getElementsByTagName( "body" )[ 0 ];
		if ( !body || !body.style ) {
			// Test fired too early or in an unsupported environment, exit.
			return;
		}

		// Setup
		div = document.createElement( "div" );
		container = document.createElement( "div" );
		container.style.cssText = "position:absolute;border:0;width:0;height:0;top:0;left:-9999px";
		body.appendChild( container ).appendChild( div );

		div.style.cssText =
			// Support: Firefox<29, Android 2.3
			// Vendor-prefix box-sizing
			"-webkit-box-sizing:border-box;-moz-box-sizing:border-box;" +
			"box-sizing:border-box;display:block;margin-top:1%;top:1%;" +
			"border:1px;padding:1px;width:4px;position:absolute";

		// Support: IE<9
		// Assume reasonable values in the absence of getComputedStyle
		pixelPositionVal = boxSizingReliableVal = false;
		reliableMarginRightVal = true;

		// Check for getComputedStyle so that this code is not run in IE<9.
		if ( window.getComputedStyle ) {
			pixelPositionVal = ( window.getComputedStyle( div, null ) || {} ).top !== "1%";
			boxSizingReliableVal =
				( window.getComputedStyle( div, null ) || { width: "4px" } ).width === "4px";

			// Support: Android 2.3
			// Div with explicit width and no margin-right incorrectly
			// gets computed margin-right based on width of container (#3333)
			// WebKit Bug 13343 - getComputedStyle returns wrong value for margin-right
			contents = div.appendChild( document.createElement( "div" ) );

			// Reset CSS: box-sizing; display; margin; border; padding
			contents.style.cssText = div.style.cssText =
				// Support: Firefox<29, Android 2.3
				// Vendor-prefix box-sizing
				"-webkit-box-sizing:content-box;-moz-box-sizing:content-box;" +
				"box-sizing:content-box;display:block;margin:0;border:0;padding:0";
			contents.style.marginRight = contents.style.width = "0";
			div.style.width = "1px";

			reliableMarginRightVal =
				!parseFloat( ( window.getComputedStyle( contents, null ) || {} ).marginRight );

			div.removeChild( contents );
		}

		// Support: IE8
		// Check if table cells still have offsetWidth/Height when they are set
		// to display:none and there are still other visible table cells in a
		// table row; if so, offsetWidth/Height are not reliable for use when
		// determining if an element has been hidden directly using
		// display:none (it is still safe to use offsets if a parent element is
		// hidden; don safety goggles and see bug #4512 for more information).
		div.innerHTML = "<table><tr><td></td><td>t</td></tr></table>";
		contents = div.getElementsByTagName( "td" );
		contents[ 0 ].style.cssText = "margin:0;border:0;padding:0;display:none";
		reliableHiddenOffsetsVal = contents[ 0 ].offsetHeight === 0;
		if ( reliableHiddenOffsetsVal ) {
			contents[ 0 ].style.display = "";
			contents[ 1 ].style.display = "none";
			reliableHiddenOffsetsVal = contents[ 0 ].offsetHeight === 0;
		}

		body.removeChild( container );
	}

})();


// A method for quickly swapping in/out CSS properties to get correct calculations.
jQuery.swap = function( elem, options, callback, args ) {
	var ret, name,
		old = {};

	// Remember the old values, and insert the new ones
	for ( name in options ) {
		old[ name ] = elem.style[ name ];
		elem.style[ name ] = options[ name ];
	}

	ret = callback.apply( elem, args || [] );

	// Revert the old values
	for ( name in options ) {
		elem.style[ name ] = old[ name ];
	}

	return ret;
};


var
		ralpha = /alpha\([^)]*\)/i,
	ropacity = /opacity\s*=\s*([^)]*)/,

	// swappable if display is none or starts with table except "table", "table-cell", or "table-caption"
	// see here for display values: https://developer.mozilla.org/en-US/docs/CSS/display
	rdisplayswap = /^(none|table(?!-c[ea]).+)/,
	rnumsplit = new RegExp( "^(" + pnum + ")(.*)$", "i" ),
	rrelNum = new RegExp( "^([+-])=(" + pnum + ")", "i" ),

	cssShow = { position: "absolute", visibility: "hidden", display: "block" },
	cssNormalTransform = {
		letterSpacing: "0",
		fontWeight: "400"
	},

	cssPrefixes = [ "Webkit", "O", "Moz", "ms" ];


// return a css property mapped to a potentially vendor prefixed property
function vendorPropName( style, name ) {

	// shortcut for names that are not vendor prefixed
	if ( name in style ) {
		return name;
	}

	// check for vendor prefixed names
	var capName = name.charAt(0).toUpperCase() + name.slice(1),
		origName = name,
		i = cssPrefixes.length;

	while ( i-- ) {
		name = cssPrefixes[ i ] + capName;
		if ( name in style ) {
			return name;
		}
	}

	return origName;
}

function showHide( elements, show ) {
	var display, elem, hidden,
		values = [],
		index = 0,
		length = elements.length;

	for ( ; index < length; index++ ) {
		elem = elements[ index ];
		if ( !elem.style ) {
			continue;
		}

		values[ index ] = jQuery._data( elem, "olddisplay" );
		display = elem.style.display;
		if ( show ) {
			// Reset the inline display of this element to learn if it is
			// being hidden by cascaded rules or not
			if ( !values[ index ] && display === "none" ) {
				elem.style.display = "";
			}

			// Set elements which have been overridden with display: none
			// in a stylesheet to whatever the default browser style is
			// for such an element
			if ( elem.style.display === "" && isHidden( elem ) ) {
				values[ index ] = jQuery._data( elem, "olddisplay", defaultDisplay(elem.nodeName) );
			}
		} else {
			hidden = isHidden( elem );

			if ( display && display !== "none" || !hidden ) {
				jQuery._data( elem, "olddisplay", hidden ? display : jQuery.css( elem, "display" ) );
			}
		}
	}

	// Set the display of most of the elements in a second loop
	// to avoid the constant reflow
	for ( index = 0; index < length; index++ ) {
		elem = elements[ index ];
		if ( !elem.style ) {
			continue;
		}
		if ( !show || elem.style.display === "none" || elem.style.display === "" ) {
			elem.style.display = show ? values[ index ] || "" : "none";
		}
	}

	return elements;
}

function setPositiveNumber( elem, value, subtract ) {
	var matches = rnumsplit.exec( value );
	return matches ?
		// Guard against undefined "subtract", e.g., when used as in cssHooks
		Math.max( 0, matches[ 1 ] - ( subtract || 0 ) ) + ( matches[ 2 ] || "px" ) :
		value;
}

function augmentWidthOrHeight( elem, name, extra, isBorderBox, styles ) {
	var i = extra === ( isBorderBox ? "border" : "content" ) ?
		// If we already have the right measurement, avoid augmentation
		4 :
		// Otherwise initialize for horizontal or vertical properties
		name === "width" ? 1 : 0,

		val = 0;

	for ( ; i < 4; i += 2 ) {
		// both box models exclude margin, so add it if we want it
		if ( extra === "margin" ) {
			val += jQuery.css( elem, extra + cssExpand[ i ], true, styles );
		}

		if ( isBorderBox ) {
			// border-box includes padding, so remove it if we want content
			if ( extra === "content" ) {
				val -= jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );
			}

			// at this point, extra isn't border nor margin, so remove border
			if ( extra !== "margin" ) {
				val -= jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
			}
		} else {
			// at this point, extra isn't content, so add padding
			val += jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );

			// at this point, extra isn't content nor padding, so add border
			if ( extra !== "padding" ) {
				val += jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
			}
		}
	}

	return val;
}

function getWidthOrHeight( elem, name, extra ) {

	// Start with offset property, which is equivalent to the border-box value
	var valueIsBorderBox = true,
		val = name === "width" ? elem.offsetWidth : elem.offsetHeight,
		styles = getStyles( elem ),
		isBorderBox = support.boxSizing && jQuery.css( elem, "boxSizing", false, styles ) === "border-box";

	// some non-html elements return undefined for offsetWidth, so check for null/undefined
	// svg - https://bugzilla.mozilla.org/show_bug.cgi?id=649285
	// MathML - https://bugzilla.mozilla.org/show_bug.cgi?id=491668
	if ( val <= 0 || val == null ) {
		// Fall back to computed then uncomputed css if necessary
		val = curCSS( elem, name, styles );
		if ( val < 0 || val == null ) {
			val = elem.style[ name ];
		}

		// Computed unit is not pixels. Stop here and return.
		if ( rnumnonpx.test(val) ) {
			return val;
		}

		// we need the check for style in case a browser which returns unreliable values
		// for getComputedStyle silently falls back to the reliable elem.style
		valueIsBorderBox = isBorderBox && ( support.boxSizingReliable() || val === elem.style[ name ] );

		// Normalize "", auto, and prepare for extra
		val = parseFloat( val ) || 0;
	}

	// use the active box-sizing model to add/subtract irrelevant styles
	return ( val +
		augmentWidthOrHeight(
			elem,
			name,
			extra || ( isBorderBox ? "border" : "content" ),
			valueIsBorderBox,
			styles
		)
	) + "px";
}

jQuery.extend({
	// Add in style property hooks for overriding the default
	// behavior of getting and setting a style property
	cssHooks: {
		opacity: {
			get: function( elem, computed ) {
				if ( computed ) {
					// We should always get a number back from opacity
					var ret = curCSS( elem, "opacity" );
					return ret === "" ? "1" : ret;
				}
			}
		}
	},

	// Don't automatically add "px" to these possibly-unitless properties
	cssNumber: {
		"columnCount": true,
		"fillOpacity": true,
		"flexGrow": true,
		"flexShrink": true,
		"fontWeight": true,
		"lineHeight": true,
		"opacity": true,
		"order": true,
		"orphans": true,
		"widows": true,
		"zIndex": true,
		"zoom": true
	},

	// Add in properties whose names you wish to fix before
	// setting or getting the value
	cssProps: {
		// normalize float css property
		"float": support.cssFloat ? "cssFloat" : "styleFloat"
	},

	// Get and set the style property on a DOM Node
	style: function( elem, name, value, extra ) {
		// Don't set styles on text and comment nodes
		if ( !elem || elem.nodeType === 3 || elem.nodeType === 8 || !elem.style ) {
			return;
		}

		// Make sure that we're working with the right name
		var ret, type, hooks,
			origName = jQuery.camelCase( name ),
			style = elem.style;

		name = jQuery.cssProps[ origName ] || ( jQuery.cssProps[ origName ] = vendorPropName( style, origName ) );

		// gets hook for the prefixed version
		// followed by the unprefixed version
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// Check if we're setting a value
		if ( value !== undefined ) {
			type = typeof value;

			// convert relative number strings (+= or -=) to relative numbers. #7345
			if ( type === "string" && (ret = rrelNum.exec( value )) ) {
				value = ( ret[1] + 1 ) * ret[2] + parseFloat( jQuery.css( elem, name ) );
				// Fixes bug #9237
				type = "number";
			}

			// Make sure that null and NaN values aren't set. See: #7116
			if ( value == null || value !== value ) {
				return;
			}

			// If a number was passed in, add 'px' to the (except for certain CSS properties)
			if ( type === "number" && !jQuery.cssNumber[ origName ] ) {
				value += "px";
			}

			// Fixes #8908, it can be done more correctly by specifing setters in cssHooks,
			// but it would mean to define eight (for every problematic property) identical functions
			if ( !support.clearCloneStyle && value === "" && name.indexOf("background") === 0 ) {
				style[ name ] = "inherit";
			}

			// If a hook was provided, use that value, otherwise just set the specified value
			if ( !hooks || !("set" in hooks) || (value = hooks.set( elem, value, extra )) !== undefined ) {

				// Support: IE
				// Swallow errors from 'invalid' CSS values (#5509)
				try {
					style[ name ] = value;
				} catch(e) {}
			}

		} else {
			// If a hook was provided get the non-computed value from there
			if ( hooks && "get" in hooks && (ret = hooks.get( elem, false, extra )) !== undefined ) {
				return ret;
			}

			// Otherwise just get the value from the style object
			return style[ name ];
		}
	},

	css: function( elem, name, extra, styles ) {
		var num, val, hooks,
			origName = jQuery.camelCase( name );

		// Make sure that we're working with the right name
		name = jQuery.cssProps[ origName ] || ( jQuery.cssProps[ origName ] = vendorPropName( elem.style, origName ) );

		// gets hook for the prefixed version
		// followed by the unprefixed version
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// If a hook was provided get the computed value from there
		if ( hooks && "get" in hooks ) {
			val = hooks.get( elem, true, extra );
		}

		// Otherwise, if a way to get the computed value exists, use that
		if ( val === undefined ) {
			val = curCSS( elem, name, styles );
		}

		//convert "normal" to computed value
		if ( val === "normal" && name in cssNormalTransform ) {
			val = cssNormalTransform[ name ];
		}

		// Return, converting to number if forced or a qualifier was provided and val looks numeric
		if ( extra === "" || extra ) {
			num = parseFloat( val );
			return extra === true || jQuery.isNumeric( num ) ? num || 0 : val;
		}
		return val;
	}
});

jQuery.each([ "height", "width" ], function( i, name ) {
	jQuery.cssHooks[ name ] = {
		get: function( elem, computed, extra ) {
			if ( computed ) {
				// certain elements can have dimension info if we invisibly show them
				// however, it must have a current display style that would benefit from this
				return rdisplayswap.test( jQuery.css( elem, "display" ) ) && elem.offsetWidth === 0 ?
					jQuery.swap( elem, cssShow, function() {
						return getWidthOrHeight( elem, name, extra );
					}) :
					getWidthOrHeight( elem, name, extra );
			}
		},

		set: function( elem, value, extra ) {
			var styles = extra && getStyles( elem );
			return setPositiveNumber( elem, value, extra ?
				augmentWidthOrHeight(
					elem,
					name,
					extra,
					support.boxSizing && jQuery.css( elem, "boxSizing", false, styles ) === "border-box",
					styles
				) : 0
			);
		}
	};
});

if ( !support.opacity ) {
	jQuery.cssHooks.opacity = {
		get: function( elem, computed ) {
			// IE uses filters for opacity
			return ropacity.test( (computed && elem.currentStyle ? elem.currentStyle.filter : elem.style.filter) || "" ) ?
				( 0.01 * parseFloat( RegExp.$1 ) ) + "" :
				computed ? "1" : "";
		},

		set: function( elem, value ) {
			var style = elem.style,
				currentStyle = elem.currentStyle,
				opacity = jQuery.isNumeric( value ) ? "alpha(opacity=" + value * 100 + ")" : "",
				filter = currentStyle && currentStyle.filter || style.filter || "";

			// IE has trouble with opacity if it does not have layout
			// Force it by setting the zoom level
			style.zoom = 1;

			// if setting opacity to 1, and no other filters exist - attempt to remove filter attribute #6652
			// if value === "", then remove inline opacity #12685
			if ( ( value >= 1 || value === "" ) &&
					jQuery.trim( filter.replace( ralpha, "" ) ) === "" &&
					style.removeAttribute ) {

				// Setting style.filter to null, "" & " " still leave "filter:" in the cssText
				// if "filter:" is present at all, clearType is disabled, we want to avoid this
				// style.removeAttribute is IE Only, but so apparently is this code path...
				style.removeAttribute( "filter" );

				// if there is no filter style applied in a css rule or unset inline opacity, we are done
				if ( value === "" || currentStyle && !currentStyle.filter ) {
					return;
				}
			}

			// otherwise, set new filter values
			style.filter = ralpha.test( filter ) ?
				filter.replace( ralpha, opacity ) :
				filter + " " + opacity;
		}
	};
}

jQuery.cssHooks.marginRight = addGetHookIf( support.reliableMarginRight,
	function( elem, computed ) {
		if ( computed ) {
			// WebKit Bug 13343 - getComputedStyle returns wrong value for margin-right
			// Work around by temporarily setting element display to inline-block
			return jQuery.swap( elem, { "display": "inline-block" },
				curCSS, [ elem, "marginRight" ] );
		}
	}
);

// These hooks are used by animate to expand properties
jQuery.each({
	margin: "",
	padding: "",
	border: "Width"
}, function( prefix, suffix ) {
	jQuery.cssHooks[ prefix + suffix ] = {
		expand: function( value ) {
			var i = 0,
				expanded = {},

				// assumes a single number if not a string
				parts = typeof value === "string" ? value.split(" ") : [ value ];

			for ( ; i < 4; i++ ) {
				expanded[ prefix + cssExpand[ i ] + suffix ] =
					parts[ i ] || parts[ i - 2 ] || parts[ 0 ];
			}

			return expanded;
		}
	};

	if ( !rmargin.test( prefix ) ) {
		jQuery.cssHooks[ prefix + suffix ].set = setPositiveNumber;
	}
});

jQuery.fn.extend({
	css: function( name, value ) {
		return access( this, function( elem, name, value ) {
			var styles, len,
				map = {},
				i = 0;

			if ( jQuery.isArray( name ) ) {
				styles = getStyles( elem );
				len = name.length;

				for ( ; i < len; i++ ) {
					map[ name[ i ] ] = jQuery.css( elem, name[ i ], false, styles );
				}

				return map;
			}

			return value !== undefined ?
				jQuery.style( elem, name, value ) :
				jQuery.css( elem, name );
		}, name, value, arguments.length > 1 );
	},
	show: function() {
		return showHide( this, true );
	},
	hide: function() {
		return showHide( this );
	},
	toggle: function( state ) {
		if ( typeof state === "boolean" ) {
			return state ? this.show() : this.hide();
		}

		return this.each(function() {
			if ( isHidden( this ) ) {
				jQuery( this ).show();
			} else {
				jQuery( this ).hide();
			}
		});
	}
});


function Tween( elem, options, prop, end, easing ) {
	return new Tween.prototype.init( elem, options, prop, end, easing );
}
jQuery.Tween = Tween;

Tween.prototype = {
	constructor: Tween,
	init: function( elem, options, prop, end, easing, unit ) {
		this.elem = elem;
		this.prop = prop;
		this.easing = easing || "swing";
		this.options = options;
		this.start = this.now = this.cur();
		this.end = end;
		this.unit = unit || ( jQuery.cssNumber[ prop ] ? "" : "px" );
	},
	cur: function() {
		var hooks = Tween.propHooks[ this.prop ];

		return hooks && hooks.get ?
			hooks.get( this ) :
			Tween.propHooks._default.get( this );
	},
	run: function( percent ) {
		var eased,
			hooks = Tween.propHooks[ this.prop ];

		if ( this.options.duration ) {
			this.pos = eased = jQuery.easing[ this.easing ](
				percent, this.options.duration * percent, 0, 1, this.options.duration
			);
		} else {
			this.pos = eased = percent;
		}
		this.now = ( this.end - this.start ) * eased + this.start;

		if ( this.options.step ) {
			this.options.step.call( this.elem, this.now, this );
		}

		if ( hooks && hooks.set ) {
			hooks.set( this );
		} else {
			Tween.propHooks._default.set( this );
		}
		return this;
	}
};

Tween.prototype.init.prototype = Tween.prototype;

Tween.propHooks = {
	_default: {
		get: function( tween ) {
			var result;

			if ( tween.elem[ tween.prop ] != null &&
				(!tween.elem.style || tween.elem.style[ tween.prop ] == null) ) {
				return tween.elem[ tween.prop ];
			}

			// passing an empty string as a 3rd parameter to .css will automatically
			// attempt a parseFloat and fallback to a string if the parse fails
			// so, simple values such as "10px" are parsed to Float.
			// complex values such as "rotate(1rad)" are returned as is.
			result = jQuery.css( tween.elem, tween.prop, "" );
			// Empty strings, null, undefined and "auto" are converted to 0.
			return !result || result === "auto" ? 0 : result;
		},
		set: function( tween ) {
			// use step hook for back compat - use cssHook if its there - use .style if its
			// available and use plain properties where available
			if ( jQuery.fx.step[ tween.prop ] ) {
				jQuery.fx.step[ tween.prop ]( tween );
			} else if ( tween.elem.style && ( tween.elem.style[ jQuery.cssProps[ tween.prop ] ] != null || jQuery.cssHooks[ tween.prop ] ) ) {
				jQuery.style( tween.elem, tween.prop, tween.now + tween.unit );
			} else {
				tween.elem[ tween.prop ] = tween.now;
			}
		}
	}
};

// Support: IE <=9
// Panic based approach to setting things on disconnected nodes

Tween.propHooks.scrollTop = Tween.propHooks.scrollLeft = {
	set: function( tween ) {
		if ( tween.elem.nodeType && tween.elem.parentNode ) {
			tween.elem[ tween.prop ] = tween.now;
		}
	}
};

jQuery.easing = {
	linear: function( p ) {
		return p;
	},
	swing: function( p ) {
		return 0.5 - Math.cos( p * Math.PI ) / 2;
	}
};

jQuery.fx = Tween.prototype.init;

// Back Compat <1.8 extension point
jQuery.fx.step = {};




var
	fxNow, timerId,
	rfxtypes = /^(?:toggle|show|hide)$/,
	rfxnum = new RegExp( "^(?:([+-])=|)(" + pnum + ")([a-z%]*)$", "i" ),
	rrun = /queueHooks$/,
	animationPrefilters = [ defaultPrefilter ],
	tweeners = {
		"*": [ function( prop, value ) {
			var tween = this.createTween( prop, value ),
				target = tween.cur(),
				parts = rfxnum.exec( value ),
				unit = parts && parts[ 3 ] || ( jQuery.cssNumber[ prop ] ? "" : "px" ),

				// Starting value computation is required for potential unit mismatches
				start = ( jQuery.cssNumber[ prop ] || unit !== "px" && +target ) &&
					rfxnum.exec( jQuery.css( tween.elem, prop ) ),
				scale = 1,
				maxIterations = 20;

			if ( start && start[ 3 ] !== unit ) {
				// Trust units reported by jQuery.css
				unit = unit || start[ 3 ];

				// Make sure we update the tween properties later on
				parts = parts || [];

				// Iteratively approximate from a nonzero starting point
				start = +target || 1;

				do {
					// If previous iteration zeroed out, double until we get *something*
					// Use a string for doubling factor so we don't accidentally see scale as unchanged below
					scale = scale || ".5";

					// Adjust and apply
					start = start / scale;
					jQuery.style( tween.elem, prop, start + unit );

				// Update scale, tolerating zero or NaN from tween.cur()
				// And breaking the loop if scale is unchanged or perfect, or if we've just had enough
				} while ( scale !== (scale = tween.cur() / target) && scale !== 1 && --maxIterations );
			}

			// Update tween properties
			if ( parts ) {
				start = tween.start = +start || +target || 0;
				tween.unit = unit;
				// If a +=/-= token was provided, we're doing a relative animation
				tween.end = parts[ 1 ] ?
					start + ( parts[ 1 ] + 1 ) * parts[ 2 ] :
					+parts[ 2 ];
			}

			return tween;
		} ]
	};

// Animations created synchronously will run synchronously
function createFxNow() {
	setTimeout(function() {
		fxNow = undefined;
	});
	return ( fxNow = jQuery.now() );
}

// Generate parameters to create a standard animation
function genFx( type, includeWidth ) {
	var which,
		attrs = { height: type },
		i = 0;

	// if we include width, step value is 1 to do all cssExpand values,
	// if we don't include width, step value is 2 to skip over Left and Right
	includeWidth = includeWidth ? 1 : 0;
	for ( ; i < 4 ; i += 2 - includeWidth ) {
		which = cssExpand[ i ];
		attrs[ "margin" + which ] = attrs[ "padding" + which ] = type;
	}

	if ( includeWidth ) {
		attrs.opacity = attrs.width = type;
	}

	return attrs;
}

function createTween( value, prop, animation ) {
	var tween,
		collection = ( tweeners[ prop ] || [] ).concat( tweeners[ "*" ] ),
		index = 0,
		length = collection.length;
	for ( ; index < length; index++ ) {
		if ( (tween = collection[ index ].call( animation, prop, value )) ) {

			// we're done with this property
			return tween;
		}
	}
}

function defaultPrefilter( elem, props, opts ) {
	/* jshint validthis: true */
	var prop, value, toggle, tween, hooks, oldfire, display, checkDisplay,
		anim = this,
		orig = {},
		style = elem.style,
		hidden = elem.nodeType && isHidden( elem ),
		dataShow = jQuery._data( elem, "fxshow" );

	// handle queue: false promises
	if ( !opts.queue ) {
		hooks = jQuery._queueHooks( elem, "fx" );
		if ( hooks.unqueued == null ) {
			hooks.unqueued = 0;
			oldfire = hooks.empty.fire;
			hooks.empty.fire = function() {
				if ( !hooks.unqueued ) {
					oldfire();
				}
			};
		}
		hooks.unqueued++;

		anim.always(function() {
			// doing this makes sure that the complete handler will be called
			// before this completes
			anim.always(function() {
				hooks.unqueued--;
				if ( !jQuery.queue( elem, "fx" ).length ) {
					hooks.empty.fire();
				}
			});
		});
	}

	// height/width overflow pass
	if ( elem.nodeType === 1 && ( "height" in props || "width" in props ) ) {
		// Make sure that nothing sneaks out
		// Record all 3 overflow attributes because IE does not
		// change the overflow attribute when overflowX and
		// overflowY are set to the same value
		opts.overflow = [ style.overflow, style.overflowX, style.overflowY ];

		// Set display property to inline-block for height/width
		// animations on inline elements that are having width/height animated
		display = jQuery.css( elem, "display" );

		// Test default display if display is currently "none"
		checkDisplay = display === "none" ?
			jQuery._data( elem, "olddisplay" ) || defaultDisplay( elem.nodeName ) : display;

		if ( checkDisplay === "inline" && jQuery.css( elem, "float" ) === "none" ) {

			// inline-level elements accept inline-block;
			// block-level elements need to be inline with layout
			if ( !support.inlineBlockNeedsLayout || defaultDisplay( elem.nodeName ) === "inline" ) {
				style.display = "inline-block";
			} else {
				style.zoom = 1;
			}
		}
	}

	if ( opts.overflow ) {
		style.overflow = "hidden";
		if ( !support.shrinkWrapBlocks() ) {
			anim.always(function() {
				style.overflow = opts.overflow[ 0 ];
				style.overflowX = opts.overflow[ 1 ];
				style.overflowY = opts.overflow[ 2 ];
			});
		}
	}

	// show/hide pass
	for ( prop in props ) {
		value = props[ prop ];
		if ( rfxtypes.exec( value ) ) {
			delete props[ prop ];
			toggle = toggle || value === "toggle";
			if ( value === ( hidden ? "hide" : "show" ) ) {

				// If there is dataShow left over from a stopped hide or show and we are going to proceed with show, we should pretend to be hidden
				if ( value === "show" && dataShow && dataShow[ prop ] !== undefined ) {
					hidden = true;
				} else {
					continue;
				}
			}
			orig[ prop ] = dataShow && dataShow[ prop ] || jQuery.style( elem, prop );

		// Any non-fx value stops us from restoring the original display value
		} else {
			display = undefined;
		}
	}

	if ( !jQuery.isEmptyObject( orig ) ) {
		if ( dataShow ) {
			if ( "hidden" in dataShow ) {
				hidden = dataShow.hidden;
			}
		} else {
			dataShow = jQuery._data( elem, "fxshow", {} );
		}

		// store state if its toggle - enables .stop().toggle() to "reverse"
		if ( toggle ) {
			dataShow.hidden = !hidden;
		}
		if ( hidden ) {
			jQuery( elem ).show();
		} else {
			anim.done(function() {
				jQuery( elem ).hide();
			});
		}
		anim.done(function() {
			var prop;
			jQuery._removeData( elem, "fxshow" );
			for ( prop in orig ) {
				jQuery.style( elem, prop, orig[ prop ] );
			}
		});
		for ( prop in orig ) {
			tween = createTween( hidden ? dataShow[ prop ] : 0, prop, anim );

			if ( !( prop in dataShow ) ) {
				dataShow[ prop ] = tween.start;
				if ( hidden ) {
					tween.end = tween.start;
					tween.start = prop === "width" || prop === "height" ? 1 : 0;
				}
			}
		}

	// If this is a noop like .hide().hide(), restore an overwritten display value
	} else if ( (display === "none" ? defaultDisplay( elem.nodeName ) : display) === "inline" ) {
		style.display = display;
	}
}

function propFilter( props, specialEasing ) {
	var index, name, easing, value, hooks;

	// camelCase, specialEasing and expand cssHook pass
	for ( index in props ) {
		name = jQuery.camelCase( index );
		easing = specialEasing[ name ];
		value = props[ index ];
		if ( jQuery.isArray( value ) ) {
			easing = value[ 1 ];
			value = props[ index ] = value[ 0 ];
		}

		if ( index !== name ) {
			props[ name ] = value;
			delete props[ index ];
		}

		hooks = jQuery.cssHooks[ name ];
		if ( hooks && "expand" in hooks ) {
			value = hooks.expand( value );
			delete props[ name ];

			// not quite $.extend, this wont overwrite keys already present.
			// also - reusing 'index' from above because we have the correct "name"
			for ( index in value ) {
				if ( !( index in props ) ) {
					props[ index ] = value[ index ];
					specialEasing[ index ] = easing;
				}
			}
		} else {
			specialEasing[ name ] = easing;
		}
	}
}

function Animation( elem, properties, options ) {
	var result,
		stopped,
		index = 0,
		length = animationPrefilters.length,
		deferred = jQuery.Deferred().always( function() {
			// don't match elem in the :animated selector
			delete tick.elem;
		}),
		tick = function() {
			if ( stopped ) {
				return false;
			}
			var currentTime = fxNow || createFxNow(),
				remaining = Math.max( 0, animation.startTime + animation.duration - currentTime ),
				// archaic crash bug won't allow us to use 1 - ( 0.5 || 0 ) (#12497)
				temp = remaining / animation.duration || 0,
				percent = 1 - temp,
				index = 0,
				length = animation.tweens.length;

			for ( ; index < length ; index++ ) {
				animation.tweens[ index ].run( percent );
			}

			deferred.notifyWith( elem, [ animation, percent, remaining ]);

			if ( percent < 1 && length ) {
				return remaining;
			} else {
				deferred.resolveWith( elem, [ animation ] );
				return false;
			}
		},
		animation = deferred.promise({
			elem: elem,
			props: jQuery.extend( {}, properties ),
			opts: jQuery.extend( true, { specialEasing: {} }, options ),
			originalProperties: properties,
			originalOptions: options,
			startTime: fxNow || createFxNow(),
			duration: options.duration,
			tweens: [],
			createTween: function( prop, end ) {
				var tween = jQuery.Tween( elem, animation.opts, prop, end,
						animation.opts.specialEasing[ prop ] || animation.opts.easing );
				animation.tweens.push( tween );
				return tween;
			},
			stop: function( gotoEnd ) {
				var index = 0,
					// if we are going to the end, we want to run all the tweens
					// otherwise we skip this part
					length = gotoEnd ? animation.tweens.length : 0;
				if ( stopped ) {
					return this;
				}
				stopped = true;
				for ( ; index < length ; index++ ) {
					animation.tweens[ index ].run( 1 );
				}

				// resolve when we played the last frame
				// otherwise, reject
				if ( gotoEnd ) {
					deferred.resolveWith( elem, [ animation, gotoEnd ] );
				} else {
					deferred.rejectWith( elem, [ animation, gotoEnd ] );
				}
				return this;
			}
		}),
		props = animation.props;

	propFilter( props, animation.opts.specialEasing );

	for ( ; index < length ; index++ ) {
		result = animationPrefilters[ index ].call( animation, elem, props, animation.opts );
		if ( result ) {
			return result;
		}
	}

	jQuery.map( props, createTween, animation );

	if ( jQuery.isFunction( animation.opts.start ) ) {
		animation.opts.start.call( elem, animation );
	}

	jQuery.fx.timer(
		jQuery.extend( tick, {
			elem: elem,
			anim: animation,
			queue: animation.opts.queue
		})
	);

	// attach callbacks from options
	return animation.progress( animation.opts.progress )
		.done( animation.opts.done, animation.opts.complete )
		.fail( animation.opts.fail )
		.always( animation.opts.always );
}

jQuery.Animation = jQuery.extend( Animation, {
	tweener: function( props, callback ) {
		if ( jQuery.isFunction( props ) ) {
			callback = props;
			props = [ "*" ];
		} else {
			props = props.split(" ");
		}

		var prop,
			index = 0,
			length = props.length;

		for ( ; index < length ; index++ ) {
			prop = props[ index ];
			tweeners[ prop ] = tweeners[ prop ] || [];
			tweeners[ prop ].unshift( callback );
		}
	},

	prefilter: function( callback, prepend ) {
		if ( prepend ) {
			animationPrefilters.unshift( callback );
		} else {
			animationPrefilters.push( callback );
		}
	}
});

jQuery.speed = function( speed, easing, fn ) {
	var opt = speed && typeof speed === "object" ? jQuery.extend( {}, speed ) : {
		complete: fn || !fn && easing ||
			jQuery.isFunction( speed ) && speed,
		duration: speed,
		easing: fn && easing || easing && !jQuery.isFunction( easing ) && easing
	};

	opt.duration = jQuery.fx.off ? 0 : typeof opt.duration === "number" ? opt.duration :
		opt.duration in jQuery.fx.speeds ? jQuery.fx.speeds[ opt.duration ] : jQuery.fx.speeds._default;

	// normalize opt.queue - true/undefined/null -> "fx"
	if ( opt.queue == null || opt.queue === true ) {
		opt.queue = "fx";
	}

	// Queueing
	opt.old = opt.complete;

	opt.complete = function() {
		if ( jQuery.isFunction( opt.old ) ) {
			opt.old.call( this );
		}

		if ( opt.queue ) {
			jQuery.dequeue( this, opt.queue );
		}
	};

	return opt;
};

jQuery.fn.extend({
	fadeTo: function( speed, to, easing, callback ) {

		// show any hidden elements after setting opacity to 0
		return this.filter( isHidden ).css( "opacity", 0 ).show()

			// animate to the value specified
			.end().animate({ opacity: to }, speed, easing, callback );
	},
	animate: function( prop, speed, easing, callback ) {
		var empty = jQuery.isEmptyObject( prop ),
			optall = jQuery.speed( speed, easing, callback ),
			doAnimation = function() {
				// Operate on a copy of prop so per-property easing won't be lost
				var anim = Animation( this, jQuery.extend( {}, prop ), optall );

				// Empty animations, or finishing resolves immediately
				if ( empty || jQuery._data( this, "finish" ) ) {
					anim.stop( true );
				}
			};
			doAnimation.finish = doAnimation;

		return empty || optall.queue === false ?
			this.each( doAnimation ) :
			this.queue( optall.queue, doAnimation );
	},
	stop: function( type, clearQueue, gotoEnd ) {
		var stopQueue = function( hooks ) {
			var stop = hooks.stop;
			delete hooks.stop;
			stop( gotoEnd );
		};

		if ( typeof type !== "string" ) {
			gotoEnd = clearQueue;
			clearQueue = type;
			type = undefined;
		}
		if ( clearQueue && type !== false ) {
			this.queue( type || "fx", [] );
		}

		return this.each(function() {
			var dequeue = true,
				index = type != null && type + "queueHooks",
				timers = jQuery.timers,
				data = jQuery._data( this );

			if ( index ) {
				if ( data[ index ] && data[ index ].stop ) {
					stopQueue( data[ index ] );
				}
			} else {
				for ( index in data ) {
					if ( data[ index ] && data[ index ].stop && rrun.test( index ) ) {
						stopQueue( data[ index ] );
					}
				}
			}

			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this && (type == null || timers[ index ].queue === type) ) {
					timers[ index ].anim.stop( gotoEnd );
					dequeue = false;
					timers.splice( index, 1 );
				}
			}

			// start the next in the queue if the last step wasn't forced
			// timers currently will call their complete callbacks, which will dequeue
			// but only if they were gotoEnd
			if ( dequeue || !gotoEnd ) {
				jQuery.dequeue( this, type );
			}
		});
	},
	finish: function( type ) {
		if ( type !== false ) {
			type = type || "fx";
		}
		return this.each(function() {
			var index,
				data = jQuery._data( this ),
				queue = data[ type + "queue" ],
				hooks = data[ type + "queueHooks" ],
				timers = jQuery.timers,
				length = queue ? queue.length : 0;

			// enable finishing flag on private data
			data.finish = true;

			// empty the queue first
			jQuery.queue( this, type, [] );

			if ( hooks && hooks.stop ) {
				hooks.stop.call( this, true );
			}

			// look for any active animations, and finish them
			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this && timers[ index ].queue === type ) {
					timers[ index ].anim.stop( true );
					timers.splice( index, 1 );
				}
			}

			// look for any animations in the old queue and finish them
			for ( index = 0; index < length; index++ ) {
				if ( queue[ index ] && queue[ index ].finish ) {
					queue[ index ].finish.call( this );
				}
			}

			// turn off finishing flag
			delete data.finish;
		});
	}
});

jQuery.each([ "toggle", "show", "hide" ], function( i, name ) {
	var cssFn = jQuery.fn[ name ];
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return speed == null || typeof speed === "boolean" ?
			cssFn.apply( this, arguments ) :
			this.animate( genFx( name, true ), speed, easing, callback );
	};
});

// Generate shortcuts for custom animations
jQuery.each({
	slideDown: genFx("show"),
	slideUp: genFx("hide"),
	slideToggle: genFx("toggle"),
	fadeIn: { opacity: "show" },
	fadeOut: { opacity: "hide" },
	fadeToggle: { opacity: "toggle" }
}, function( name, props ) {
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return this.animate( props, speed, easing, callback );
	};
});

jQuery.timers = [];
jQuery.fx.tick = function() {
	var timer,
		timers = jQuery.timers,
		i = 0;

	fxNow = jQuery.now();

	for ( ; i < timers.length; i++ ) {
		timer = timers[ i ];
		// Checks the timer has not already been removed
		if ( !timer() && timers[ i ] === timer ) {
			timers.splice( i--, 1 );
		}
	}

	if ( !timers.length ) {
		jQuery.fx.stop();
	}
	fxNow = undefined;
};

jQuery.fx.timer = function( timer ) {
	jQuery.timers.push( timer );
	if ( timer() ) {
		jQuery.fx.start();
	} else {
		jQuery.timers.pop();
	}
};

jQuery.fx.interval = 13;

jQuery.fx.start = function() {
	if ( !timerId ) {
		timerId = setInterval( jQuery.fx.tick, jQuery.fx.interval );
	}
};

jQuery.fx.stop = function() {
	clearInterval( timerId );
	timerId = null;
};

jQuery.fx.speeds = {
	slow: 600,
	fast: 200,
	// Default speed
	_default: 400
};


// Based off of the plugin by Clint Helfers, with permission.
// http://blindsignals.com/index.php/2009/07/jquery-delay/
jQuery.fn.delay = function( time, type ) {
	time = jQuery.fx ? jQuery.fx.speeds[ time ] || time : time;
	type = type || "fx";

	return this.queue( type, function( next, hooks ) {
		var timeout = setTimeout( next, time );
		hooks.stop = function() {
			clearTimeout( timeout );
		};
	});
};


(function() {
	// Minified: var a,b,c,d,e
	var input, div, select, a, opt;

	// Setup
	div = document.createElement( "div" );
	div.setAttribute( "className", "t" );
	div.innerHTML = "  <link/><table></table><a href='/a'>a</a><input type='checkbox'/>";
	a = div.getElementsByTagName("a")[ 0 ];

	// First batch of tests.
	select = document.createElement("select");
	opt = select.appendChild( document.createElement("option") );
	input = div.getElementsByTagName("input")[ 0 ];

	a.style.cssText = "top:1px";

	// Test setAttribute on camelCase class. If it works, we need attrFixes when doing get/setAttribute (ie6/7)
	support.getSetAttribute = div.className !== "t";

	// Get the style information from getAttribute
	// (IE uses .cssText instead)
	support.style = /top/.test( a.getAttribute("style") );

	// Make sure that URLs aren't manipulated
	// (IE normalizes it by default)
	support.hrefNormalized = a.getAttribute("href") === "/a";

	// Check the default checkbox/radio value ("" on WebKit; "on" elsewhere)
	support.checkOn = !!input.value;

	// Make sure that a selected-by-default option has a working selected property.
	// (WebKit defaults to false instead of true, IE too, if it's in an optgroup)
	support.optSelected = opt.selected;

	// Tests for enctype support on a form (#6743)
	support.enctype = !!document.createElement("form").enctype;

	// Make sure that the options inside disabled selects aren't marked as disabled
	// (WebKit marks them as disabled)
	select.disabled = true;
	support.optDisabled = !opt.disabled;

	// Support: IE8 only
	// Check if we can trust getAttribute("value")
	input = document.createElement( "input" );
	input.setAttribute( "value", "" );
	support.input = input.getAttribute( "value" ) === "";

	// Check if an input maintains its value after becoming a radio
	input.value = "t";
	input.setAttribute( "type", "radio" );
	support.radioValue = input.value === "t";
})();


var rreturn = /\r/g;

jQuery.fn.extend({
	val: function( value ) {
		var hooks, ret, isFunction,
			elem = this[0];

		if ( !arguments.length ) {
			if ( elem ) {
				hooks = jQuery.valHooks[ elem.type ] || jQuery.valHooks[ elem.nodeName.toLowerCase() ];

				if ( hooks && "get" in hooks && (ret = hooks.get( elem, "value" )) !== undefined ) {
					return ret;
				}

				ret = elem.value;

				return typeof ret === "string" ?
					// handle most common string cases
					ret.replace(rreturn, "") :
					// handle cases where value is null/undef or number
					ret == null ? "" : ret;
			}

			return;
		}

		isFunction = jQuery.isFunction( value );

		return this.each(function( i ) {
			var val;

			if ( this.nodeType !== 1 ) {
				return;
			}

			if ( isFunction ) {
				val = value.call( this, i, jQuery( this ).val() );
			} else {
				val = value;
			}

			// Treat null/undefined as ""; convert numbers to string
			if ( val == null ) {
				val = "";
			} else if ( typeof val === "number" ) {
				val += "";
			} else if ( jQuery.isArray( val ) ) {
				val = jQuery.map( val, function( value ) {
					return value == null ? "" : value + "";
				});
			}

			hooks = jQuery.valHooks[ this.type ] || jQuery.valHooks[ this.nodeName.toLowerCase() ];

			// If set returns undefined, fall back to normal setting
			if ( !hooks || !("set" in hooks) || hooks.set( this, val, "value" ) === undefined ) {
				this.value = val;
			}
		});
	}
});

jQuery.extend({
	valHooks: {
		option: {
			get: function( elem ) {
				var val = jQuery.find.attr( elem, "value" );
				return val != null ?
					val :
					// Support: IE10-11+
					// option.text throws exceptions (#14686, #14858)
					jQuery.trim( jQuery.text( elem ) );
			}
		},
		select: {
			get: function( elem ) {
				var value, option,
					options = elem.options,
					index = elem.selectedIndex,
					one = elem.type === "select-one" || index < 0,
					values = one ? null : [],
					max = one ? index + 1 : options.length,
					i = index < 0 ?
						max :
						one ? index : 0;

				// Loop through all the selected options
				for ( ; i < max; i++ ) {
					option = options[ i ];

					// oldIE doesn't update selected after form reset (#2551)
					if ( ( option.selected || i === index ) &&
							// Don't return options that are disabled or in a disabled optgroup
							( support.optDisabled ? !option.disabled : option.getAttribute("disabled") === null ) &&
							( !option.parentNode.disabled || !jQuery.nodeName( option.parentNode, "optgroup" ) ) ) {

						// Get the specific value for the option
						value = jQuery( option ).val();

						// We don't need an array for one selects
						if ( one ) {
							return value;
						}

						// Multi-Selects return an array
						values.push( value );
					}
				}

				return values;
			},

			set: function( elem, value ) {
				var optionSet, option,
					options = elem.options,
					values = jQuery.makeArray( value ),
					i = options.length;

				while ( i-- ) {
					option = options[ i ];

					if ( jQuery.inArray( jQuery.valHooks.option.get( option ), values ) >= 0 ) {

						// Support: IE6
						// When new option element is added to select box we need to
						// force reflow of newly added node in order to workaround delay
						// of initialization properties
						try {
							option.selected = optionSet = true;

						} catch ( _ ) {

							// Will be executed only in IE6
							option.scrollHeight;
						}

					} else {
						option.selected = false;
					}
				}

				// Force browsers to behave consistently when non-matching value is set
				if ( !optionSet ) {
					elem.selectedIndex = -1;
				}

				return options;
			}
		}
	}
});

// Radios and checkboxes getter/setter
jQuery.each([ "radio", "checkbox" ], function() {
	jQuery.valHooks[ this ] = {
		set: function( elem, value ) {
			if ( jQuery.isArray( value ) ) {
				return ( elem.checked = jQuery.inArray( jQuery(elem).val(), value ) >= 0 );
			}
		}
	};
	if ( !support.checkOn ) {
		jQuery.valHooks[ this ].get = function( elem ) {
			// Support: Webkit
			// "" is returned instead of "on" if a value isn't specified
			return elem.getAttribute("value") === null ? "on" : elem.value;
		};
	}
});




var nodeHook, boolHook,
	attrHandle = jQuery.expr.attrHandle,
	ruseDefault = /^(?:checked|selected)$/i,
	getSetAttribute = support.getSetAttribute,
	getSetInput = support.input;

jQuery.fn.extend({
	attr: function( name, value ) {
		return access( this, jQuery.attr, name, value, arguments.length > 1 );
	},

	removeAttr: function( name ) {
		return this.each(function() {
			jQuery.removeAttr( this, name );
		});
	}
});

jQuery.extend({
	attr: function( elem, name, value ) {
		var hooks, ret,
			nType = elem.nodeType;

		// don't get/set attributes on text, comment and attribute nodes
		if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		// Fallback to prop when attributes are not supported
		if ( typeof elem.getAttribute === strundefined ) {
			return jQuery.prop( elem, name, value );
		}

		// All attributes are lowercase
		// Grab necessary hook if one is defined
		if ( nType !== 1 || !jQuery.isXMLDoc( elem ) ) {
			name = name.toLowerCase();
			hooks = jQuery.attrHooks[ name ] ||
				( jQuery.expr.match.bool.test( name ) ? boolHook : nodeHook );
		}

		if ( value !== undefined ) {

			if ( value === null ) {
				jQuery.removeAttr( elem, name );

			} else if ( hooks && "set" in hooks && (ret = hooks.set( elem, value, name )) !== undefined ) {
				return ret;

			} else {
				elem.setAttribute( name, value + "" );
				return value;
			}

		} else if ( hooks && "get" in hooks && (ret = hooks.get( elem, name )) !== null ) {
			return ret;

		} else {
			ret = jQuery.find.attr( elem, name );

			// Non-existent attributes return null, we normalize to undefined
			return ret == null ?
				undefined :
				ret;
		}
	},

	removeAttr: function( elem, value ) {
		var name, propName,
			i = 0,
			attrNames = value && value.match( rnotwhite );

		if ( attrNames && elem.nodeType === 1 ) {
			while ( (name = attrNames[i++]) ) {
				propName = jQuery.propFix[ name ] || name;

				// Boolean attributes get special treatment (#10870)
				if ( jQuery.expr.match.bool.test( name ) ) {
					// Set corresponding property to false
					if ( getSetInput && getSetAttribute || !ruseDefault.test( name ) ) {
						elem[ propName ] = false;
					// Support: IE<9
					// Also clear defaultChecked/defaultSelected (if appropriate)
					} else {
						elem[ jQuery.camelCase( "default-" + name ) ] =
							elem[ propName ] = false;
					}

				// See #9699 for explanation of this approach (setting first, then removal)
				} else {
					jQuery.attr( elem, name, "" );
				}

				elem.removeAttribute( getSetAttribute ? name : propName );
			}
		}
	},

	attrHooks: {
		type: {
			set: function( elem, value ) {
				if ( !support.radioValue && value === "radio" && jQuery.nodeName(elem, "input") ) {
					// Setting the type on a radio button after the value resets the value in IE6-9
					// Reset value to default in case type is set after value during creation
					var val = elem.value;
					elem.setAttribute( "type", value );
					if ( val ) {
						elem.value = val;
					}
					return value;
				}
			}
		}
	}
});

// Hook for boolean attributes
boolHook = {
	set: function( elem, value, name ) {
		if ( value === false ) {
			// Remove boolean attributes when set to false
			jQuery.removeAttr( elem, name );
		} else if ( getSetInput && getSetAttribute || !ruseDefault.test( name ) ) {
			// IE<8 needs the *property* name
			elem.setAttribute( !getSetAttribute && jQuery.propFix[ name ] || name, name );

		// Use defaultChecked and defaultSelected for oldIE
		} else {
			elem[ jQuery.camelCase( "default-" + name ) ] = elem[ name ] = true;
		}

		return name;
	}
};

// Retrieve booleans specially
jQuery.each( jQuery.expr.match.bool.source.match( /\w+/g ), function( i, name ) {

	var getter = attrHandle[ name ] || jQuery.find.attr;

	attrHandle[ name ] = getSetInput && getSetAttribute || !ruseDefault.test( name ) ?
		function( elem, name, isXML ) {
			var ret, handle;
			if ( !isXML ) {
				// Avoid an infinite loop by temporarily removing this function from the getter
				handle = attrHandle[ name ];
				attrHandle[ name ] = ret;
				ret = getter( elem, name, isXML ) != null ?
					name.toLowerCase() :
					null;
				attrHandle[ name ] = handle;
			}
			return ret;
		} :
		function( elem, name, isXML ) {
			if ( !isXML ) {
				return elem[ jQuery.camelCase( "default-" + name ) ] ?
					name.toLowerCase() :
					null;
			}
		};
});

// fix oldIE attroperties
if ( !getSetInput || !getSetAttribute ) {
	jQuery.attrHooks.value = {
		set: function( elem, value, name ) {
			if ( jQuery.nodeName( elem, "input" ) ) {
				// Does not return so that setAttribute is also used
				elem.defaultValue = value;
			} else {
				// Use nodeHook if defined (#1954); otherwise setAttribute is fine
				return nodeHook && nodeHook.set( elem, value, name );
			}
		}
	};
}

// IE6/7 do not support getting/setting some attributes with get/setAttribute
if ( !getSetAttribute ) {

	// Use this for any attribute in IE6/7
	// This fixes almost every IE6/7 issue
	nodeHook = {
		set: function( elem, value, name ) {
			// Set the existing or create a new attribute node
			var ret = elem.getAttributeNode( name );
			if ( !ret ) {
				elem.setAttributeNode(
					(ret = elem.ownerDocument.createAttribute( name ))
				);
			}

			ret.value = value += "";

			// Break association with cloned elements by also using setAttribute (#9646)
			if ( name === "value" || value === elem.getAttribute( name ) ) {
				return value;
			}
		}
	};

	// Some attributes are constructed with empty-string values when not defined
	attrHandle.id = attrHandle.name = attrHandle.coords =
		function( elem, name, isXML ) {
			var ret;
			if ( !isXML ) {
				return (ret = elem.getAttributeNode( name )) && ret.value !== "" ?
					ret.value :
					null;
			}
		};

	// Fixing value retrieval on a button requires this module
	jQuery.valHooks.button = {
		get: function( elem, name ) {
			var ret = elem.getAttributeNode( name );
			if ( ret && ret.specified ) {
				return ret.value;
			}
		},
		set: nodeHook.set
	};

	// Set contenteditable to false on removals(#10429)
	// Setting to empty string throws an error as an invalid value
	jQuery.attrHooks.contenteditable = {
		set: function( elem, value, name ) {
			nodeHook.set( elem, value === "" ? false : value, name );
		}
	};

	// Set width and height to auto instead of 0 on empty string( Bug #8150 )
	// This is for removals
	jQuery.each([ "width", "height" ], function( i, name ) {
		jQuery.attrHooks[ name ] = {
			set: function( elem, value ) {
				if ( value === "" ) {
					elem.setAttribute( name, "auto" );
					return value;
				}
			}
		};
	});
}

if ( !support.style ) {
	jQuery.attrHooks.style = {
		get: function( elem ) {
			// Return undefined in the case of empty string
			// Note: IE uppercases css property names, but if we were to .toLowerCase()
			// .cssText, that would destroy case senstitivity in URL's, like in "background"
			return elem.style.cssText || undefined;
		},
		set: function( elem, value ) {
			return ( elem.style.cssText = value + "" );
		}
	};
}




var rfocusable = /^(?:input|select|textarea|button|object)$/i,
	rclickable = /^(?:a|area)$/i;

jQuery.fn.extend({
	prop: function( name, value ) {
		return access( this, jQuery.prop, name, value, arguments.length > 1 );
	},

	removeProp: function( name ) {
		name = jQuery.propFix[ name ] || name;
		return this.each(function() {
			// try/catch handles cases where IE balks (such as removing a property on window)
			try {
				this[ name ] = undefined;
				delete this[ name ];
			} catch( e ) {}
		});
	}
});

jQuery.extend({
	propFix: {
		"for": "htmlFor",
		"class": "className"
	},

	prop: function( elem, name, value ) {
		var ret, hooks, notxml,
			nType = elem.nodeType;

		// don't get/set properties on text, comment and attribute nodes
		if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		notxml = nType !== 1 || !jQuery.isXMLDoc( elem );

		if ( notxml ) {
			// Fix name and attach hooks
			name = jQuery.propFix[ name ] || name;
			hooks = jQuery.propHooks[ name ];
		}

		if ( value !== undefined ) {
			return hooks && "set" in hooks && (ret = hooks.set( elem, value, name )) !== undefined ?
				ret :
				( elem[ name ] = value );

		} else {
			return hooks && "get" in hooks && (ret = hooks.get( elem, name )) !== null ?
				ret :
				elem[ name ];
		}
	},

	propHooks: {
		tabIndex: {
			get: function( elem ) {
				// elem.tabIndex doesn't always return the correct value when it hasn't been explicitly set
				// http://fluidproject.org/blog/2008/01/09/getting-setting-and-removing-tabindex-values-with-javascript/
				// Use proper attribute retrieval(#12072)
				var tabindex = jQuery.find.attr( elem, "tabindex" );

				return tabindex ?
					parseInt( tabindex, 10 ) :
					rfocusable.test( elem.nodeName ) || rclickable.test( elem.nodeName ) && elem.href ?
						0 :
						-1;
			}
		}
	}
});

// Some attributes require a special call on IE
// http://msdn.microsoft.com/en-us/library/ms536429%28VS.85%29.aspx
if ( !support.hrefNormalized ) {
	// href/src property should get the full normalized URL (#10299/#12915)
	jQuery.each([ "href", "src" ], function( i, name ) {
		jQuery.propHooks[ name ] = {
			get: function( elem ) {
				return elem.getAttribute( name, 4 );
			}
		};
	});
}

// Support: Safari, IE9+
// mis-reports the default selected property of an option
// Accessing the parent's selectedIndex property fixes it
if ( !support.optSelected ) {
	jQuery.propHooks.selected = {
		get: function( elem ) {
			var parent = elem.parentNode;

			if ( parent ) {
				parent.selectedIndex;

				// Make sure that it also works with optgroups, see #5701
				if ( parent.parentNode ) {
					parent.parentNode.selectedIndex;
				}
			}
			return null;
		}
	};
}

jQuery.each([
	"tabIndex",
	"readOnly",
	"maxLength",
	"cellSpacing",
	"cellPadding",
	"rowSpan",
	"colSpan",
	"useMap",
	"frameBorder",
	"contentEditable"
], function() {
	jQuery.propFix[ this.toLowerCase() ] = this;
});

// IE6/7 call enctype encoding
if ( !support.enctype ) {
	jQuery.propFix.enctype = "encoding";
}




var rclass = /[\t\r\n\f]/g;

jQuery.fn.extend({
	addClass: function( value ) {
		var classes, elem, cur, clazz, j, finalValue,
			i = 0,
			len = this.length,
			proceed = typeof value === "string" && value;

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( j ) {
				jQuery( this ).addClass( value.call( this, j, this.className ) );
			});
		}

		if ( proceed ) {
			// The disjunction here is for better compressibility (see removeClass)
			classes = ( value || "" ).match( rnotwhite ) || [];

			for ( ; i < len; i++ ) {
				elem = this[ i ];
				cur = elem.nodeType === 1 && ( elem.className ?
					( " " + elem.className + " " ).replace( rclass, " " ) :
					" "
				);

				if ( cur ) {
					j = 0;
					while ( (clazz = classes[j++]) ) {
						if ( cur.indexOf( " " + clazz + " " ) < 0 ) {
							cur += clazz + " ";
						}
					}

					// only assign if different to avoid unneeded rendering.
					finalValue = jQuery.trim( cur );
					if ( elem.className !== finalValue ) {
						elem.className = finalValue;
					}
				}
			}
		}

		return this;
	},

	removeClass: function( value ) {
		var classes, elem, cur, clazz, j, finalValue,
			i = 0,
			len = this.length,
			proceed = arguments.length === 0 || typeof value === "string" && value;

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( j ) {
				jQuery( this ).removeClass( value.call( this, j, this.className ) );
			});
		}
		if ( proceed ) {
			classes = ( value || "" ).match( rnotwhite ) || [];

			for ( ; i < len; i++ ) {
				elem = this[ i ];
				// This expression is here for better compressibility (see addClass)
				cur = elem.nodeType === 1 && ( elem.className ?
					( " " + elem.className + " " ).replace( rclass, " " ) :
					""
				);

				if ( cur ) {
					j = 0;
					while ( (clazz = classes[j++]) ) {
						// Remove *all* instances
						while ( cur.indexOf( " " + clazz + " " ) >= 0 ) {
							cur = cur.replace( " " + clazz + " ", " " );
						}
					}

					// only assign if different to avoid unneeded rendering.
					finalValue = value ? jQuery.trim( cur ) : "";
					if ( elem.className !== finalValue ) {
						elem.className = finalValue;
					}
				}
			}
		}

		return this;
	},

	toggleClass: function( value, stateVal ) {
		var type = typeof value;

		if ( typeof stateVal === "boolean" && type === "string" ) {
			return stateVal ? this.addClass( value ) : this.removeClass( value );
		}

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( i ) {
				jQuery( this ).toggleClass( value.call(this, i, this.className, stateVal), stateVal );
			});
		}

		return this.each(function() {
			if ( type === "string" ) {
				// toggle individual class names
				var className,
					i = 0,
					self = jQuery( this ),
					classNames = value.match( rnotwhite ) || [];

				while ( (className = classNames[ i++ ]) ) {
					// check each className given, space separated list
					if ( self.hasClass( className ) ) {
						self.removeClass( className );
					} else {
						self.addClass( className );
					}
				}

			// Toggle whole class name
			} else if ( type === strundefined || type === "boolean" ) {
				if ( this.className ) {
					// store className if set
					jQuery._data( this, "__className__", this.className );
				}

				// If the element has a class name or if we're passed "false",
				// then remove the whole classname (if there was one, the above saved it).
				// Otherwise bring back whatever was previously saved (if anything),
				// falling back to the empty string if nothing was stored.
				this.className = this.className || value === false ? "" : jQuery._data( this, "__className__" ) || "";
			}
		});
	},

	hasClass: function( selector ) {
		var className = " " + selector + " ",
			i = 0,
			l = this.length;
		for ( ; i < l; i++ ) {
			if ( this[i].nodeType === 1 && (" " + this[i].className + " ").replace(rclass, " ").indexOf( className ) >= 0 ) {
				return true;
			}
		}

		return false;
	}
});




// Return jQuery for attributes-only inclusion


jQuery.each( ("blur focus focusin focusout load resize scroll unload click dblclick " +
	"mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave " +
	"change select submit keydown keypress keyup error contextmenu").split(" "), function( i, name ) {

	// Handle event binding
	jQuery.fn[ name ] = function( data, fn ) {
		return arguments.length > 0 ?
			this.on( name, null, data, fn ) :
			this.trigger( name );
	};
});

jQuery.fn.extend({
	hover: function( fnOver, fnOut ) {
		return this.mouseenter( fnOver ).mouseleave( fnOut || fnOver );
	},

	bind: function( types, data, fn ) {
		return this.on( types, null, data, fn );
	},
	unbind: function( types, fn ) {
		return this.off( types, null, fn );
	},

	delegate: function( selector, types, data, fn ) {
		return this.on( types, selector, data, fn );
	},
	undelegate: function( selector, types, fn ) {
		// ( namespace ) or ( selector, types [, fn] )
		return arguments.length === 1 ? this.off( selector, "**" ) : this.off( types, selector || "**", fn );
	}
});


var nonce = jQuery.now();

var rquery = (/\?/);



var rvalidtokens = /(,)|(\[|{)|(}|])|"(?:[^"\\\r\n]|\\["\\\/bfnrt]|\\u[\da-fA-F]{4})*"\s*:?|true|false|null|-?(?!0\d)\d+(?:\.\d+|)(?:[eE][+-]?\d+|)/g;

jQuery.parseJSON = function( data ) {
	// Attempt to parse using the native JSON parser first
	if ( window.JSON && window.JSON.parse ) {
		// Support: Android 2.3
		// Workaround failure to string-cast null input
		return window.JSON.parse( data + "" );
	}

	var requireNonComma,
		depth = null,
		str = jQuery.trim( data + "" );

	// Guard against invalid (and possibly dangerous) input by ensuring that nothing remains
	// after removing valid tokens
	return str && !jQuery.trim( str.replace( rvalidtokens, function( token, comma, open, close ) {

		// Force termination if we see a misplaced comma
		if ( requireNonComma && comma ) {
			depth = 0;
		}

		// Perform no more replacements after returning to outermost depth
		if ( depth === 0 ) {
			return token;
		}

		// Commas must not follow "[", "{", or ","
		requireNonComma = open || comma;

		// Determine new depth
		// array/object open ("[" or "{"): depth += true - false (increment)
		// array/object close ("]" or "}"): depth += false - true (decrement)
		// other cases ("," or primitive): depth += true - true (numeric cast)
		depth += !close - !open;

		// Remove this token
		return "";
	}) ) ?
		( Function( "return " + str ) )() :
		jQuery.error( "Invalid JSON: " + data );
};


// Cross-browser xml parsing
jQuery.parseXML = function( data ) {
	var xml, tmp;
	if ( !data || typeof data !== "string" ) {
		return null;
	}
	try {
		if ( window.DOMParser ) { // Standard
			tmp = new DOMParser();
			xml = tmp.parseFromString( data, "text/xml" );
		} else { // IE
			xml = new ActiveXObject( "Microsoft.XMLDOM" );
			xml.async = "false";
			xml.loadXML( data );
		}
	} catch( e ) {
		xml = undefined;
	}
	if ( !xml || !xml.documentElement || xml.getElementsByTagName( "parsererror" ).length ) {
		jQuery.error( "Invalid XML: " + data );
	}
	return xml;
};


var
	// Document location
	ajaxLocParts,
	ajaxLocation,

	rhash = /#.*$/,
	rts = /([?&])_=[^&]*/,
	rheaders = /^(.*?):[ \t]*([^\r\n]*)\r?$/mg, // IE leaves an \r character at EOL
	// #7653, #8125, #8152: local protocol detection
	rlocalProtocol = /^(?:about|app|app-storage|.+-extension|file|res|widget):$/,
	rnoContent = /^(?:GET|HEAD)$/,
	rprotocol = /^\/\//,
	rurl = /^([\w.+-]+:)(?:\/\/(?:[^\/?#]*@|)([^\/?#:]*)(?::(\d+)|)|)/,

	/* Prefilters
	 * 1) They are useful to introduce custom dataTypes (see ajax/jsonp.js for an example)
	 * 2) These are called:
	 *    - BEFORE asking for a transport
	 *    - AFTER param serialization (s.data is a string if s.processData is true)
	 * 3) key is the dataType
	 * 4) the catchall symbol "*" can be used
	 * 5) execution will start with transport dataType and THEN continue down to "*" if needed
	 */
	prefilters = {},

	/* Transports bindings
	 * 1) key is the dataType
	 * 2) the catchall symbol "*" can be used
	 * 3) selection will start with transport dataType and THEN go to "*" if needed
	 */
	transports = {},

	// Avoid comment-prolog char sequence (#10098); must appease lint and evade compression
	allTypes = "*/".concat("*");

// #8138, IE may throw an exception when accessing
// a field from window.location if document.domain has been set
try {
	ajaxLocation = location.href;
} catch( e ) {
	// Use the href attribute of an A element
	// since IE will modify it given document.location
	ajaxLocation = document.createElement( "a" );
	ajaxLocation.href = "";
	ajaxLocation = ajaxLocation.href;
}

// Segment location into parts
ajaxLocParts = rurl.exec( ajaxLocation.toLowerCase() ) || [];

// Base "constructor" for jQuery.ajaxPrefilter and jQuery.ajaxTransport
function addToPrefiltersOrTransports( structure ) {

	// dataTypeExpression is optional and defaults to "*"
	return function( dataTypeExpression, func ) {

		if ( typeof dataTypeExpression !== "string" ) {
			func = dataTypeExpression;
			dataTypeExpression = "*";
		}

		var dataType,
			i = 0,
			dataTypes = dataTypeExpression.toLowerCase().match( rnotwhite ) || [];

		if ( jQuery.isFunction( func ) ) {
			// For each dataType in the dataTypeExpression
			while ( (dataType = dataTypes[i++]) ) {
				// Prepend if requested
				if ( dataType.charAt( 0 ) === "+" ) {
					dataType = dataType.slice( 1 ) || "*";
					(structure[ dataType ] = structure[ dataType ] || []).unshift( func );

				// Otherwise append
				} else {
					(structure[ dataType ] = structure[ dataType ] || []).push( func );
				}
			}
		}
	};
}

// Base inspection function for prefilters and transports
function inspectPrefiltersOrTransports( structure, options, originalOptions, jqXHR ) {

	var inspected = {},
		seekingTransport = ( structure === transports );

	function inspect( dataType ) {
		var selected;
		inspected[ dataType ] = true;
		jQuery.each( structure[ dataType ] || [], function( _, prefilterOrFactory ) {
			var dataTypeOrTransport = prefilterOrFactory( options, originalOptions, jqXHR );
			if ( typeof dataTypeOrTransport === "string" && !seekingTransport && !inspected[ dataTypeOrTransport ] ) {
				options.dataTypes.unshift( dataTypeOrTransport );
				inspect( dataTypeOrTransport );
				return false;
			} else if ( seekingTransport ) {
				return !( selected = dataTypeOrTransport );
			}
		});
		return selected;
	}

	return inspect( options.dataTypes[ 0 ] ) || !inspected[ "*" ] && inspect( "*" );
}

// A special extend for ajax options
// that takes "flat" options (not to be deep extended)
// Fixes #9887
function ajaxExtend( target, src ) {
	var deep, key,
		flatOptions = jQuery.ajaxSettings.flatOptions || {};

	for ( key in src ) {
		if ( src[ key ] !== undefined ) {
			( flatOptions[ key ] ? target : ( deep || (deep = {}) ) )[ key ] = src[ key ];
		}
	}
	if ( deep ) {
		jQuery.extend( true, target, deep );
	}

	return target;
}

/* Handles responses to an ajax request:
 * - finds the right dataType (mediates between content-type and expected dataType)
 * - returns the corresponding response
 */
function ajaxHandleResponses( s, jqXHR, responses ) {
	var firstDataType, ct, finalDataType, type,
		contents = s.contents,
		dataTypes = s.dataTypes;

	// Remove auto dataType and get content-type in the process
	while ( dataTypes[ 0 ] === "*" ) {
		dataTypes.shift();
		if ( ct === undefined ) {
			ct = s.mimeType || jqXHR.getResponseHeader("Content-Type");
		}
	}

	// Check if we're dealing with a known content-type
	if ( ct ) {
		for ( type in contents ) {
			if ( contents[ type ] && contents[ type ].test( ct ) ) {
				dataTypes.unshift( type );
				break;
			}
		}
	}

	// Check to see if we have a response for the expected dataType
	if ( dataTypes[ 0 ] in responses ) {
		finalDataType = dataTypes[ 0 ];
	} else {
		// Try convertible dataTypes
		for ( type in responses ) {
			if ( !dataTypes[ 0 ] || s.converters[ type + " " + dataTypes[0] ] ) {
				finalDataType = type;
				break;
			}
			if ( !firstDataType ) {
				firstDataType = type;
			}
		}
		// Or just use first one
		finalDataType = finalDataType || firstDataType;
	}

	// If we found a dataType
	// We add the dataType to the list if needed
	// and return the corresponding response
	if ( finalDataType ) {
		if ( finalDataType !== dataTypes[ 0 ] ) {
			dataTypes.unshift( finalDataType );
		}
		return responses[ finalDataType ];
	}
}

/* Chain conversions given the request and the original response
 * Also sets the responseXXX fields on the jqXHR instance
 */
function ajaxConvert( s, response, jqXHR, isSuccess ) {
	var conv2, current, conv, tmp, prev,
		converters = {},
		// Work with a copy of dataTypes in case we need to modify it for conversion
		dataTypes = s.dataTypes.slice();

	// Create converters map with lowercased keys
	if ( dataTypes[ 1 ] ) {
		for ( conv in s.converters ) {
			converters[ conv.toLowerCase() ] = s.converters[ conv ];
		}
	}

	current = dataTypes.shift();

	// Convert to each sequential dataType
	while ( current ) {

		if ( s.responseFields[ current ] ) {
			jqXHR[ s.responseFields[ current ] ] = response;
		}

		// Apply the dataFilter if provided
		if ( !prev && isSuccess && s.dataFilter ) {
			response = s.dataFilter( response, s.dataType );
		}

		prev = current;
		current = dataTypes.shift();

		if ( current ) {

			// There's only work to do if current dataType is non-auto
			if ( current === "*" ) {

				current = prev;

			// Convert response if prev dataType is non-auto and differs from current
			} else if ( prev !== "*" && prev !== current ) {

				// Seek a direct converter
				conv = converters[ prev + " " + current ] || converters[ "* " + current ];

				// If none found, seek a pair
				if ( !conv ) {
					for ( conv2 in converters ) {

						// If conv2 outputs current
						tmp = conv2.split( " " );
						if ( tmp[ 1 ] === current ) {

							// If prev can be converted to accepted input
							conv = converters[ prev + " " + tmp[ 0 ] ] ||
								converters[ "* " + tmp[ 0 ] ];
							if ( conv ) {
								// Condense equivalence converters
								if ( conv === true ) {
									conv = converters[ conv2 ];

								// Otherwise, insert the intermediate dataType
								} else if ( converters[ conv2 ] !== true ) {
									current = tmp[ 0 ];
									dataTypes.unshift( tmp[ 1 ] );
								}
								break;
							}
						}
					}
				}

				// Apply converter (if not an equivalence)
				if ( conv !== true ) {

					// Unless errors are allowed to bubble, catch and return them
					if ( conv && s[ "throws" ] ) {
						response = conv( response );
					} else {
						try {
							response = conv( response );
						} catch ( e ) {
							return { state: "parsererror", error: conv ? e : "No conversion from " + prev + " to " + current };
						}
					}
				}
			}
		}
	}

	return { state: "success", data: response };
}

jQuery.extend({

	// Counter for holding the number of active queries
	active: 0,

	// Last-Modified header cache for next request
	lastModified: {},
	etag: {},

	ajaxSettings: {
		url: ajaxLocation,
		type: "GET",
		isLocal: rlocalProtocol.test( ajaxLocParts[ 1 ] ),
		global: true,
		processData: true,
		async: true,
		contentType: "application/x-www-form-urlencoded; charset=UTF-8",
		/*
		timeout: 0,
		data: null,
		dataType: null,
		username: null,
		password: null,
		cache: null,
		throws: false,
		traditional: false,
		headers: {},
		*/

		accepts: {
			"*": allTypes,
			text: "text/plain",
			html: "text/html",
			xml: "application/xml, text/xml",
			json: "application/json, text/javascript"
		},

		contents: {
			xml: /xml/,
			html: /html/,
			json: /json/
		},

		responseFields: {
			xml: "responseXML",
			text: "responseText",
			json: "responseJSON"
		},

		// Data converters
		// Keys separate source (or catchall "*") and destination types with a single space
		converters: {

			// Convert anything to text
			"* text": String,

			// Text to html (true = no transformation)
			"text html": true,

			// Evaluate text as a json expression
			"text json": jQuery.parseJSON,

			// Parse text as xml
			"text xml": jQuery.parseXML
		},

		// For options that shouldn't be deep extended:
		// you can add your own custom options here if
		// and when you create one that shouldn't be
		// deep extended (see ajaxExtend)
		flatOptions: {
			url: true,
			context: true
		}
	},

	// Creates a full fledged settings object into target
	// with both ajaxSettings and settings fields.
	// If target is omitted, writes into ajaxSettings.
	ajaxSetup: function( target, settings ) {
		return settings ?

			// Building a settings object
			ajaxExtend( ajaxExtend( target, jQuery.ajaxSettings ), settings ) :

			// Extending ajaxSettings
			ajaxExtend( jQuery.ajaxSettings, target );
	},

	ajaxPrefilter: addToPrefiltersOrTransports( prefilters ),
	ajaxTransport: addToPrefiltersOrTransports( transports ),

	// Main method
	ajax: function( url, options ) {

		// If url is an object, simulate pre-1.5 signature
		if ( typeof url === "object" ) {
			options = url;
			url = undefined;
		}

		// Force options to be an object
		options = options || {};

		var // Cross-domain detection vars
			parts,
			// Loop variable
			i,
			// URL without anti-cache param
			cacheURL,
			// Response headers as string
			responseHeadersString,
			// timeout handle
			timeoutTimer,

			// To know if global events are to be dispatched
			fireGlobals,

			transport,
			// Response headers
			responseHeaders,
			// Create the final options object
			s = jQuery.ajaxSetup( {}, options ),
			// Callbacks context
			callbackContext = s.context || s,
			// Context for global events is callbackContext if it is a DOM node or jQuery collection
			globalEventContext = s.context && ( callbackContext.nodeType || callbackContext.jquery ) ?
				jQuery( callbackContext ) :
				jQuery.event,
			// Deferreds
			deferred = jQuery.Deferred(),
			completeDeferred = jQuery.Callbacks("once memory"),
			// Status-dependent callbacks
			statusCode = s.statusCode || {},
			// Headers (they are sent all at once)
			requestHeaders = {},
			requestHeadersNames = {},
			// The jqXHR state
			state = 0,
			// Default abort message
			strAbort = "canceled",
			// Fake xhr
			jqXHR = {
				readyState: 0,

				// Builds headers hashtable if needed
				getResponseHeader: function( key ) {
					var match;
					if ( state === 2 ) {
						if ( !responseHeaders ) {
							responseHeaders = {};
							while ( (match = rheaders.exec( responseHeadersString )) ) {
								responseHeaders[ match[1].toLowerCase() ] = match[ 2 ];
							}
						}
						match = responseHeaders[ key.toLowerCase() ];
					}
					return match == null ? null : match;
				},

				// Raw string
				getAllResponseHeaders: function() {
					return state === 2 ? responseHeadersString : null;
				},

				// Caches the header
				setRequestHeader: function( name, value ) {
					var lname = name.toLowerCase();
					if ( !state ) {
						name = requestHeadersNames[ lname ] = requestHeadersNames[ lname ] || name;
						requestHeaders[ name ] = value;
					}
					return this;
				},

				// Overrides response content-type header
				overrideMimeType: function( type ) {
					if ( !state ) {
						s.mimeType = type;
					}
					return this;
				},

				// Status-dependent callbacks
				statusCode: function( map ) {
					var code;
					if ( map ) {
						if ( state < 2 ) {
							for ( code in map ) {
								// Lazy-add the new callback in a way that preserves old ones
								statusCode[ code ] = [ statusCode[ code ], map[ code ] ];
							}
						} else {
							// Execute the appropriate callbacks
							jqXHR.always( map[ jqXHR.status ] );
						}
					}
					return this;
				},

				// Cancel the request
				abort: function( statusText ) {
					var finalText = statusText || strAbort;
					if ( transport ) {
						transport.abort( finalText );
					}
					done( 0, finalText );
					return this;
				}
			};

		// Attach deferreds
		deferred.promise( jqXHR ).complete = completeDeferred.add;
		jqXHR.success = jqXHR.done;
		jqXHR.error = jqXHR.fail;

		// Remove hash character (#7531: and string promotion)
		// Add protocol if not provided (#5866: IE7 issue with protocol-less urls)
		// Handle falsy url in the settings object (#10093: consistency with old signature)
		// We also use the url parameter if available
		s.url = ( ( url || s.url || ajaxLocation ) + "" ).replace( rhash, "" ).replace( rprotocol, ajaxLocParts[ 1 ] + "//" );

		// Alias method option to type as per ticket #12004
		s.type = options.method || options.type || s.method || s.type;

		// Extract dataTypes list
		s.dataTypes = jQuery.trim( s.dataType || "*" ).toLowerCase().match( rnotwhite ) || [ "" ];

		// A cross-domain request is in order when we have a protocol:host:port mismatch
		if ( s.crossDomain == null ) {
			parts = rurl.exec( s.url.toLowerCase() );
			s.crossDomain = !!( parts &&
				( parts[ 1 ] !== ajaxLocParts[ 1 ] || parts[ 2 ] !== ajaxLocParts[ 2 ] ||
					( parts[ 3 ] || ( parts[ 1 ] === "http:" ? "80" : "443" ) ) !==
						( ajaxLocParts[ 3 ] || ( ajaxLocParts[ 1 ] === "http:" ? "80" : "443" ) ) )
			);
		}

		// Convert data if not already a string
		if ( s.data && s.processData && typeof s.data !== "string" ) {
			s.data = jQuery.param( s.data, s.traditional );
		}

		// Apply prefilters
		inspectPrefiltersOrTransports( prefilters, s, options, jqXHR );

		// If request was aborted inside a prefilter, stop there
		if ( state === 2 ) {
			return jqXHR;
		}

		// We can fire global events as of now if asked to
		// Don't fire events if jQuery.event is undefined in an AMD-usage scenario (#15118)
		fireGlobals = jQuery.event && s.global;

		// Watch for a new set of requests
		if ( fireGlobals && jQuery.active++ === 0 ) {
			jQuery.event.trigger("ajaxStart");
		}

		// Uppercase the type
		s.type = s.type.toUpperCase();

		// Determine if request has content
		s.hasContent = !rnoContent.test( s.type );

		// Save the URL in case we're toying with the If-Modified-Since
		// and/or If-None-Match header later on
		cacheURL = s.url;

		// More options handling for requests with no content
		if ( !s.hasContent ) {

			// If data is available, append data to url
			if ( s.data ) {
				cacheURL = ( s.url += ( rquery.test( cacheURL ) ? "&" : "?" ) + s.data );
				// #9682: remove data so that it's not used in an eventual retry
				delete s.data;
			}

			// Add anti-cache in url if needed
			if ( s.cache === false ) {
				s.url = rts.test( cacheURL ) ?

					// If there is already a '_' parameter, set its value
					cacheURL.replace( rts, "$1_=" + nonce++ ) :

					// Otherwise add one to the end
					cacheURL + ( rquery.test( cacheURL ) ? "&" : "?" ) + "_=" + nonce++;
			}
		}

		// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
		if ( s.ifModified ) {
			if ( jQuery.lastModified[ cacheURL ] ) {
				jqXHR.setRequestHeader( "If-Modified-Since", jQuery.lastModified[ cacheURL ] );
			}
			if ( jQuery.etag[ cacheURL ] ) {
				jqXHR.setRequestHeader( "If-None-Match", jQuery.etag[ cacheURL ] );
			}
		}

		// Set the correct header, if data is being sent
		if ( s.data && s.hasContent && s.contentType !== false || options.contentType ) {
			jqXHR.setRequestHeader( "Content-Type", s.contentType );
		}

		// Set the Accepts header for the server, depending on the dataType
		jqXHR.setRequestHeader(
			"Accept",
			s.dataTypes[ 0 ] && s.accepts[ s.dataTypes[0] ] ?
				s.accepts[ s.dataTypes[0] ] + ( s.dataTypes[ 0 ] !== "*" ? ", " + allTypes + "; q=0.01" : "" ) :
				s.accepts[ "*" ]
		);

		// Check for headers option
		for ( i in s.headers ) {
			jqXHR.setRequestHeader( i, s.headers[ i ] );
		}

		// Allow custom headers/mimetypes and early abort
		if ( s.beforeSend && ( s.beforeSend.call( callbackContext, jqXHR, s ) === false || state === 2 ) ) {
			// Abort if not done already and return
			return jqXHR.abort();
		}

		// aborting is no longer a cancellation
		strAbort = "abort";

		// Install callbacks on deferreds
		for ( i in { success: 1, error: 1, complete: 1 } ) {
			jqXHR[ i ]( s[ i ] );
		}

		// Get transport
		transport = inspectPrefiltersOrTransports( transports, s, options, jqXHR );

		// If no transport, we auto-abort
		if ( !transport ) {
			done( -1, "No Transport" );
		} else {
			jqXHR.readyState = 1;

			// Send global event
			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxSend", [ jqXHR, s ] );
			}
			// Timeout
			if ( s.async && s.timeout > 0 ) {
				timeoutTimer = setTimeout(function() {
					jqXHR.abort("timeout");
				}, s.timeout );
			}

			try {
				state = 1;
				transport.send( requestHeaders, done );
			} catch ( e ) {
				// Propagate exception as error if not done
				if ( state < 2 ) {
					done( -1, e );
				// Simply rethrow otherwise
				} else {
					throw e;
				}
			}
		}

		// Callback for when everything is done
		function done( status, nativeStatusText, responses, headers ) {
			var isSuccess, success, error, response, modified,
				statusText = nativeStatusText;

			// Called once
			if ( state === 2 ) {
				return;
			}

			// State is "done" now
			state = 2;

			// Clear timeout if it exists
			if ( timeoutTimer ) {
				clearTimeout( timeoutTimer );
			}

			// Dereference transport for early garbage collection
			// (no matter how long the jqXHR object will be used)
			transport = undefined;

			// Cache response headers
			responseHeadersString = headers || "";

			// Set readyState
			jqXHR.readyState = status > 0 ? 4 : 0;

			// Determine if successful
			isSuccess = status >= 200 && status < 300 || status === 304;

			// Get response data
			if ( responses ) {
				response = ajaxHandleResponses( s, jqXHR, responses );
			}

			// Convert no matter what (that way responseXXX fields are always set)
			response = ajaxConvert( s, response, jqXHR, isSuccess );

			// If successful, handle type chaining
			if ( isSuccess ) {

				// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
				if ( s.ifModified ) {
					modified = jqXHR.getResponseHeader("Last-Modified");
					if ( modified ) {
						jQuery.lastModified[ cacheURL ] = modified;
					}
					modified = jqXHR.getResponseHeader("etag");
					if ( modified ) {
						jQuery.etag[ cacheURL ] = modified;
					}
				}

				// if no content
				if ( status === 204 || s.type === "HEAD" ) {
					statusText = "nocontent";

				// if not modified
				} else if ( status === 304 ) {
					statusText = "notmodified";

				// If we have data, let's convert it
				} else {
					statusText = response.state;
					success = response.data;
					error = response.error;
					isSuccess = !error;
				}
			} else {
				// We extract error from statusText
				// then normalize statusText and status for non-aborts
				error = statusText;
				if ( status || !statusText ) {
					statusText = "error";
					if ( status < 0 ) {
						status = 0;
					}
				}
			}

			// Set data for the fake xhr object
			jqXHR.status = status;
			jqXHR.statusText = ( nativeStatusText || statusText ) + "";

			// Success/Error
			if ( isSuccess ) {
				deferred.resolveWith( callbackContext, [ success, statusText, jqXHR ] );
			} else {
				deferred.rejectWith( callbackContext, [ jqXHR, statusText, error ] );
			}

			// Status-dependent callbacks
			jqXHR.statusCode( statusCode );
			statusCode = undefined;

			if ( fireGlobals ) {
				globalEventContext.trigger( isSuccess ? "ajaxSuccess" : "ajaxError",
					[ jqXHR, s, isSuccess ? success : error ] );
			}

			// Complete
			completeDeferred.fireWith( callbackContext, [ jqXHR, statusText ] );

			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxComplete", [ jqXHR, s ] );
				// Handle the global AJAX counter
				if ( !( --jQuery.active ) ) {
					jQuery.event.trigger("ajaxStop");
				}
			}
		}

		return jqXHR;
	},

	getJSON: function( url, data, callback ) {
		return jQuery.get( url, data, callback, "json" );
	},

	getScript: function( url, callback ) {
		return jQuery.get( url, undefined, callback, "script" );
	}
});

jQuery.each( [ "get", "post" ], function( i, method ) {
	jQuery[ method ] = function( url, data, callback, type ) {
		// shift arguments if data argument was omitted
		if ( jQuery.isFunction( data ) ) {
			type = type || callback;
			callback = data;
			data = undefined;
		}

		return jQuery.ajax({
			url: url,
			type: method,
			dataType: type,
			data: data,
			success: callback
		});
	};
});


jQuery._evalUrl = function( url ) {
	return jQuery.ajax({
		url: url,
		type: "GET",
		dataType: "script",
		async: false,
		global: false,
		"throws": true
	});
};


jQuery.fn.extend({
	wrapAll: function( html ) {
		if ( jQuery.isFunction( html ) ) {
			return this.each(function(i) {
				jQuery(this).wrapAll( html.call(this, i) );
			});
		}

		if ( this[0] ) {
			// The elements to wrap the target around
			var wrap = jQuery( html, this[0].ownerDocument ).eq(0).clone(true);

			if ( this[0].parentNode ) {
				wrap.insertBefore( this[0] );
			}

			wrap.map(function() {
				var elem = this;

				while ( elem.firstChild && elem.firstChild.nodeType === 1 ) {
					elem = elem.firstChild;
				}

				return elem;
			}).append( this );
		}

		return this;
	},

	wrapInner: function( html ) {
		if ( jQuery.isFunction( html ) ) {
			return this.each(function(i) {
				jQuery(this).wrapInner( html.call(this, i) );
			});
		}

		return this.each(function() {
			var self = jQuery( this ),
				contents = self.contents();

			if ( contents.length ) {
				contents.wrapAll( html );

			} else {
				self.append( html );
			}
		});
	},

	wrap: function( html ) {
		var isFunction = jQuery.isFunction( html );

		return this.each(function(i) {
			jQuery( this ).wrapAll( isFunction ? html.call(this, i) : html );
		});
	},

	unwrap: function() {
		return this.parent().each(function() {
			if ( !jQuery.nodeName( this, "body" ) ) {
				jQuery( this ).replaceWith( this.childNodes );
			}
		}).end();
	}
});


jQuery.expr.filters.hidden = function( elem ) {
	// Support: Opera <= 12.12
	// Opera reports offsetWidths and offsetHeights less than zero on some elements
	return elem.offsetWidth <= 0 && elem.offsetHeight <= 0 ||
		(!support.reliableHiddenOffsets() &&
			((elem.style && elem.style.display) || jQuery.css( elem, "display" )) === "none");
};

jQuery.expr.filters.visible = function( elem ) {
	return !jQuery.expr.filters.hidden( elem );
};




var r20 = /%20/g,
	rbracket = /\[\]$/,
	rCRLF = /\r?\n/g,
	rsubmitterTypes = /^(?:submit|button|image|reset|file)$/i,
	rsubmittable = /^(?:input|select|textarea|keygen)/i;

function buildParams( prefix, obj, traditional, add ) {
	var name;

	if ( jQuery.isArray( obj ) ) {
		// Serialize array item.
		jQuery.each( obj, function( i, v ) {
			if ( traditional || rbracket.test( prefix ) ) {
				// Treat each array item as a scalar.
				add( prefix, v );

			} else {
				// Item is non-scalar (array or object), encode its numeric index.
				buildParams( prefix + "[" + ( typeof v === "object" ? i : "" ) + "]", v, traditional, add );
			}
		});

	} else if ( !traditional && jQuery.type( obj ) === "object" ) {
		// Serialize object item.
		for ( name in obj ) {
			buildParams( prefix + "[" + name + "]", obj[ name ], traditional, add );
		}

	} else {
		// Serialize scalar item.
		add( prefix, obj );
	}
}

// Serialize an array of form elements or a set of
// key/values into a query string
jQuery.param = function( a, traditional ) {
	var prefix,
		s = [],
		add = function( key, value ) {
			// If value is a function, invoke it and return its value
			value = jQuery.isFunction( value ) ? value() : ( value == null ? "" : value );
			s[ s.length ] = encodeURIComponent( key ) + "=" + encodeURIComponent( value );
		};

	// Set traditional to true for jQuery <= 1.3.2 behavior.
	if ( traditional === undefined ) {
		traditional = jQuery.ajaxSettings && jQuery.ajaxSettings.traditional;
	}

	// If an array was passed in, assume that it is an array of form elements.
	if ( jQuery.isArray( a ) || ( a.jquery && !jQuery.isPlainObject( a ) ) ) {
		// Serialize the form elements
		jQuery.each( a, function() {
			add( this.name, this.value );
		});

	} else {
		// If traditional, encode the "old" way (the way 1.3.2 or older
		// did it), otherwise encode params recursively.
		for ( prefix in a ) {
			buildParams( prefix, a[ prefix ], traditional, add );
		}
	}

	// Return the resulting serialization
	return s.join( "&" ).replace( r20, "+" );
};

jQuery.fn.extend({
	serialize: function() {
		return jQuery.param( this.serializeArray() );
	},
	serializeArray: function() {
		return this.map(function() {
			// Can add propHook for "elements" to filter or add form elements
			var elements = jQuery.prop( this, "elements" );
			return elements ? jQuery.makeArray( elements ) : this;
		})
		.filter(function() {
			var type = this.type;
			// Use .is(":disabled") so that fieldset[disabled] works
			return this.name && !jQuery( this ).is( ":disabled" ) &&
				rsubmittable.test( this.nodeName ) && !rsubmitterTypes.test( type ) &&
				( this.checked || !rcheckableType.test( type ) );
		})
		.map(function( i, elem ) {
			var val = jQuery( this ).val();

			return val == null ?
				null :
				jQuery.isArray( val ) ?
					jQuery.map( val, function( val ) {
						return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
					}) :
					{ name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
		}).get();
	}
});


// Create the request object
// (This is still attached to ajaxSettings for backward compatibility)
jQuery.ajaxSettings.xhr = window.ActiveXObject !== undefined ?
	// Support: IE6+
	function() {

		// XHR cannot access local files, always use ActiveX for that case
		return !this.isLocal &&

			// Support: IE7-8
			// oldIE XHR does not support non-RFC2616 methods (#13240)
			// See http://msdn.microsoft.com/en-us/library/ie/ms536648(v=vs.85).aspx
			// and http://www.w3.org/Protocols/rfc2616/rfc2616-sec9.html#sec9
			// Although this check for six methods instead of eight
			// since IE also does not support "trace" and "connect"
			/^(get|post|head|put|delete|options)$/i.test( this.type ) &&

			createStandardXHR() || createActiveXHR();
	} :
	// For all other browsers, use the standard XMLHttpRequest object
	createStandardXHR;

var xhrId = 0,
	xhrCallbacks = {},
	xhrSupported = jQuery.ajaxSettings.xhr();

// Support: IE<10
// Open requests must be manually aborted on unload (#5280)
// See https://support.microsoft.com/kb/2856746 for more info
if ( window.attachEvent ) {
	window.attachEvent( "onunload", function() {
		for ( var key in xhrCallbacks ) {
			xhrCallbacks[ key ]( undefined, true );
		}
	});
}

// Determine support properties
support.cors = !!xhrSupported && ( "withCredentials" in xhrSupported );
xhrSupported = support.ajax = !!xhrSupported;

// Create transport if the browser can provide an xhr
if ( xhrSupported ) {

	jQuery.ajaxTransport(function( options ) {
		// Cross domain only allowed if supported through XMLHttpRequest
		if ( !options.crossDomain || support.cors ) {

			var callback;

			return {
				send: function( headers, complete ) {
					var i,
						xhr = options.xhr(),
						id = ++xhrId;

					// Open the socket
					xhr.open( options.type, options.url, options.async, options.username, options.password );

					// Apply custom fields if provided
					if ( options.xhrFields ) {
						for ( i in options.xhrFields ) {
							xhr[ i ] = options.xhrFields[ i ];
						}
					}

					// Override mime type if needed
					if ( options.mimeType && xhr.overrideMimeType ) {
						xhr.overrideMimeType( options.mimeType );
					}

					// X-Requested-With header
					// For cross-domain requests, seeing as conditions for a preflight are
					// akin to a jigsaw puzzle, we simply never set it to be sure.
					// (it can always be set on a per-request basis or even using ajaxSetup)
					// For same-domain requests, won't change header if already provided.
					if ( !options.crossDomain && !headers["X-Requested-With"] ) {
						headers["X-Requested-With"] = "XMLHttpRequest";
					}

					// Set headers
					for ( i in headers ) {
						// Support: IE<9
						// IE's ActiveXObject throws a 'Type Mismatch' exception when setting
						// request header to a null-value.
						//
						// To keep consistent with other XHR implementations, cast the value
						// to string and ignore `undefined`.
						if ( headers[ i ] !== undefined ) {
							xhr.setRequestHeader( i, headers[ i ] + "" );
						}
					}

					// Do send the request
					// This may raise an exception which is actually
					// handled in jQuery.ajax (so no try/catch here)
					xhr.send( ( options.hasContent && options.data ) || null );

					// Listener
					callback = function( _, isAbort ) {
						var status, statusText, responses;

						// Was never called and is aborted or complete
						if ( callback && ( isAbort || xhr.readyState === 4 ) ) {
							// Clean up
							delete xhrCallbacks[ id ];
							callback = undefined;
							xhr.onreadystatechange = jQuery.noop;

							// Abort manually if needed
							if ( isAbort ) {
								if ( xhr.readyState !== 4 ) {
									xhr.abort();
								}
							} else {
								responses = {};
								status = xhr.status;

								// Support: IE<10
								// Accessing binary-data responseText throws an exception
								// (#11426)
								if ( typeof xhr.responseText === "string" ) {
									responses.text = xhr.responseText;
								}

								// Firefox throws an exception when accessing
								// statusText for faulty cross-domain requests
								try {
									statusText = xhr.statusText;
								} catch( e ) {
									// We normalize with Webkit giving an empty statusText
									statusText = "";
								}

								// Filter status for non standard behaviors

								// If the request is local and we have data: assume a success
								// (success with no data won't get notified, that's the best we
								// can do given current implementations)
								if ( !status && options.isLocal && !options.crossDomain ) {
									status = responses.text ? 200 : 404;
								// IE - #1450: sometimes returns 1223 when it should be 204
								} else if ( status === 1223 ) {
									status = 204;
								}
							}
						}

						// Call complete if needed
						if ( responses ) {
							complete( status, statusText, responses, xhr.getAllResponseHeaders() );
						}
					};

					if ( !options.async ) {
						// if we're in sync mode we fire the callback
						callback();
					} else if ( xhr.readyState === 4 ) {
						// (IE6 & IE7) if it's in cache and has been
						// retrieved directly we need to fire the callback
						setTimeout( callback );
					} else {
						// Add to the list of active xhr callbacks
						xhr.onreadystatechange = xhrCallbacks[ id ] = callback;
					}
				},

				abort: function() {
					if ( callback ) {
						callback( undefined, true );
					}
				}
			};
		}
	});
}

// Functions to create xhrs
function createStandardXHR() {
	try {
		return new window.XMLHttpRequest();
	} catch( e ) {}
}

function createActiveXHR() {
	try {
		return new window.ActiveXObject( "Microsoft.XMLHTTP" );
	} catch( e ) {}
}




// Install script dataType
jQuery.ajaxSetup({
	accepts: {
		script: "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"
	},
	contents: {
		script: /(?:java|ecma)script/
	},
	converters: {
		"text script": function( text ) {
			jQuery.globalEval( text );
			return text;
		}
	}
});

// Handle cache's special case and global
jQuery.ajaxPrefilter( "script", function( s ) {
	if ( s.cache === undefined ) {
		s.cache = false;
	}
	if ( s.crossDomain ) {
		s.type = "GET";
		s.global = false;
	}
});

// Bind script tag hack transport
jQuery.ajaxTransport( "script", function(s) {

	// This transport only deals with cross domain requests
	if ( s.crossDomain ) {

		var script,
			head = document.head || jQuery("head")[0] || document.documentElement;

		return {

			send: function( _, callback ) {

				script = document.createElement("script");

				script.async = true;

				if ( s.scriptCharset ) {
					script.charset = s.scriptCharset;
				}

				script.src = s.url;

				// Attach handlers for all browsers
				script.onload = script.onreadystatechange = function( _, isAbort ) {

					if ( isAbort || !script.readyState || /loaded|complete/.test( script.readyState ) ) {

						// Handle memory leak in IE
						script.onload = script.onreadystatechange = null;

						// Remove the script
						if ( script.parentNode ) {
							script.parentNode.removeChild( script );
						}

						// Dereference the script
						script = null;

						// Callback if not abort
						if ( !isAbort ) {
							callback( 200, "success" );
						}
					}
				};

				// Circumvent IE6 bugs with base elements (#2709 and #4378) by prepending
				// Use native DOM manipulation to avoid our domManip AJAX trickery
				head.insertBefore( script, head.firstChild );
			},

			abort: function() {
				if ( script ) {
					script.onload( undefined, true );
				}
			}
		};
	}
});




var oldCallbacks = [],
	rjsonp = /(=)\?(?=&|$)|\?\?/;

// Default jsonp settings
jQuery.ajaxSetup({
	jsonp: "callback",
	jsonpCallback: function() {
		var callback = oldCallbacks.pop() || ( jQuery.expando + "_" + ( nonce++ ) );
		this[ callback ] = true;
		return callback;
	}
});

// Detect, normalize options and install callbacks for jsonp requests
jQuery.ajaxPrefilter( "json jsonp", function( s, originalSettings, jqXHR ) {

	var callbackName, overwritten, responseContainer,
		jsonProp = s.jsonp !== false && ( rjsonp.test( s.url ) ?
			"url" :
			typeof s.data === "string" && !( s.contentType || "" ).indexOf("application/x-www-form-urlencoded") && rjsonp.test( s.data ) && "data"
		);

	// Handle iff the expected data type is "jsonp" or we have a parameter to set
	if ( jsonProp || s.dataTypes[ 0 ] === "jsonp" ) {

		// Get callback name, remembering preexisting value associated with it
		callbackName = s.jsonpCallback = jQuery.isFunction( s.jsonpCallback ) ?
			s.jsonpCallback() :
			s.jsonpCallback;

		// Insert callback into url or form data
		if ( jsonProp ) {
			s[ jsonProp ] = s[ jsonProp ].replace( rjsonp, "$1" + callbackName );
		} else if ( s.jsonp !== false ) {
			s.url += ( rquery.test( s.url ) ? "&" : "?" ) + s.jsonp + "=" + callbackName;
		}

		// Use data converter to retrieve json after script execution
		s.converters["script json"] = function() {
			if ( !responseContainer ) {
				jQuery.error( callbackName + " was not called" );
			}
			return responseContainer[ 0 ];
		};

		// force json dataType
		s.dataTypes[ 0 ] = "json";

		// Install callback
		overwritten = window[ callbackName ];
		window[ callbackName ] = function() {
			responseContainer = arguments;
		};

		// Clean-up function (fires after converters)
		jqXHR.always(function() {
			// Restore preexisting value
			window[ callbackName ] = overwritten;

			// Save back as free
			if ( s[ callbackName ] ) {
				// make sure that re-using the options doesn't screw things around
				s.jsonpCallback = originalSettings.jsonpCallback;

				// save the callback name for future use
				oldCallbacks.push( callbackName );
			}

			// Call if it was a function and we have a response
			if ( responseContainer && jQuery.isFunction( overwritten ) ) {
				overwritten( responseContainer[ 0 ] );
			}

			responseContainer = overwritten = undefined;
		});

		// Delegate to script
		return "script";
	}
});




// data: string of html
// context (optional): If specified, the fragment will be created in this context, defaults to document
// keepScripts (optional): If true, will include scripts passed in the html string
jQuery.parseHTML = function( data, context, keepScripts ) {
	if ( !data || typeof data !== "string" ) {
		return null;
	}
	if ( typeof context === "boolean" ) {
		keepScripts = context;
		context = false;
	}
	context = context || document;

	var parsed = rsingleTag.exec( data ),
		scripts = !keepScripts && [];

	// Single tag
	if ( parsed ) {
		return [ context.createElement( parsed[1] ) ];
	}

	parsed = jQuery.buildFragment( [ data ], context, scripts );

	if ( scripts && scripts.length ) {
		jQuery( scripts ).remove();
	}

	return jQuery.merge( [], parsed.childNodes );
};


// Keep a copy of the old load method
var _load = jQuery.fn.load;

/**
 * Load a url into a page
 */
jQuery.fn.load = function( url, params, callback ) {
	if ( typeof url !== "string" && _load ) {
		return _load.apply( this, arguments );
	}

	var selector, response, type,
		self = this,
		off = url.indexOf(" ");

	if ( off >= 0 ) {
		selector = jQuery.trim( url.slice( off, url.length ) );
		url = url.slice( 0, off );
	}

	// If it's a function
	if ( jQuery.isFunction( params ) ) {

		// We assume that it's the callback
		callback = params;
		params = undefined;

	// Otherwise, build a param string
	} else if ( params && typeof params === "object" ) {
		type = "POST";
	}

	// If we have elements to modify, make the request
	if ( self.length > 0 ) {
		jQuery.ajax({
			url: url,

			// if "type" variable is undefined, then "GET" method will be used
			type: type,
			dataType: "html",
			data: params
		}).done(function( responseText ) {

			// Save response for use in complete callback
			response = arguments;

			self.html( selector ?

				// If a selector was specified, locate the right elements in a dummy div
				// Exclude scripts to avoid IE 'Permission Denied' errors
				jQuery("<div>").append( jQuery.parseHTML( responseText ) ).find( selector ) :

				// Otherwise use the full result
				responseText );

		}).complete( callback && function( jqXHR, status ) {
			self.each( callback, response || [ jqXHR.responseText, status, jqXHR ] );
		});
	}

	return this;
};




// Attach a bunch of functions for handling common AJAX events
jQuery.each( [ "ajaxStart", "ajaxStop", "ajaxComplete", "ajaxError", "ajaxSuccess", "ajaxSend" ], function( i, type ) {
	jQuery.fn[ type ] = function( fn ) {
		return this.on( type, fn );
	};
});




jQuery.expr.filters.animated = function( elem ) {
	return jQuery.grep(jQuery.timers, function( fn ) {
		return elem === fn.elem;
	}).length;
};





var docElem = window.document.documentElement;

/**
 * Gets a window from an element
 */
function getWindow( elem ) {
	return jQuery.isWindow( elem ) ?
		elem :
		elem.nodeType === 9 ?
			elem.defaultView || elem.parentWindow :
			false;
}

jQuery.offset = {
	setOffset: function( elem, options, i ) {
		var curPosition, curLeft, curCSSTop, curTop, curOffset, curCSSLeft, calculatePosition,
			position = jQuery.css( elem, "position" ),
			curElem = jQuery( elem ),
			props = {};

		// set position first, in-case top/left are set even on static elem
		if ( position === "static" ) {
			elem.style.position = "relative";
		}

		curOffset = curElem.offset();
		curCSSTop = jQuery.css( elem, "top" );
		curCSSLeft = jQuery.css( elem, "left" );
		calculatePosition = ( position === "absolute" || position === "fixed" ) &&
			jQuery.inArray("auto", [ curCSSTop, curCSSLeft ] ) > -1;

		// need to be able to calculate position if either top or left is auto and position is either absolute or fixed
		if ( calculatePosition ) {
			curPosition = curElem.position();
			curTop = curPosition.top;
			curLeft = curPosition.left;
		} else {
			curTop = parseFloat( curCSSTop ) || 0;
			curLeft = parseFloat( curCSSLeft ) || 0;
		}

		if ( jQuery.isFunction( options ) ) {
			options = options.call( elem, i, curOffset );
		}

		if ( options.top != null ) {
			props.top = ( options.top - curOffset.top ) + curTop;
		}
		if ( options.left != null ) {
			props.left = ( options.left - curOffset.left ) + curLeft;
		}

		if ( "using" in options ) {
			options.using.call( elem, props );
		} else {
			curElem.css( props );
		}
	}
};

jQuery.fn.extend({
	offset: function( options ) {
		if ( arguments.length ) {
			return options === undefined ?
				this :
				this.each(function( i ) {
					jQuery.offset.setOffset( this, options, i );
				});
		}

		var docElem, win,
			box = { top: 0, left: 0 },
			elem = this[ 0 ],
			doc = elem && elem.ownerDocument;

		if ( !doc ) {
			return;
		}

		docElem = doc.documentElement;

		// Make sure it's not a disconnected DOM node
		if ( !jQuery.contains( docElem, elem ) ) {
			return box;
		}

		// If we don't have gBCR, just use 0,0 rather than error
		// BlackBerry 5, iOS 3 (original iPhone)
		if ( typeof elem.getBoundingClientRect !== strundefined ) {
			box = elem.getBoundingClientRect();
		}
		win = getWindow( doc );
		return {
			top: box.top  + ( win.pageYOffset || docElem.scrollTop )  - ( docElem.clientTop  || 0 ),
			left: box.left + ( win.pageXOffset || docElem.scrollLeft ) - ( docElem.clientLeft || 0 )
		};
	},

	position: function() {
		if ( !this[ 0 ] ) {
			return;
		}

		var offsetParent, offset,
			parentOffset = { top: 0, left: 0 },
			elem = this[ 0 ];

		// fixed elements are offset from window (parentOffset = {top:0, left: 0}, because it is its only offset parent
		if ( jQuery.css( elem, "position" ) === "fixed" ) {
			// we assume that getBoundingClientRect is available when computed position is fixed
			offset = elem.getBoundingClientRect();
		} else {
			// Get *real* offsetParent
			offsetParent = this.offsetParent();

			// Get correct offsets
			offset = this.offset();
			if ( !jQuery.nodeName( offsetParent[ 0 ], "html" ) ) {
				parentOffset = offsetParent.offset();
			}

			// Add offsetParent borders
			parentOffset.top  += jQuery.css( offsetParent[ 0 ], "borderTopWidth", true );
			parentOffset.left += jQuery.css( offsetParent[ 0 ], "borderLeftWidth", true );
		}

		// Subtract parent offsets and element margins
		// note: when an element has margin: auto the offsetLeft and marginLeft
		// are the same in Safari causing offset.left to incorrectly be 0
		return {
			top:  offset.top  - parentOffset.top - jQuery.css( elem, "marginTop", true ),
			left: offset.left - parentOffset.left - jQuery.css( elem, "marginLeft", true)
		};
	},

	offsetParent: function() {
		return this.map(function() {
			var offsetParent = this.offsetParent || docElem;

			while ( offsetParent && ( !jQuery.nodeName( offsetParent, "html" ) && jQuery.css( offsetParent, "position" ) === "static" ) ) {
				offsetParent = offsetParent.offsetParent;
			}
			return offsetParent || docElem;
		});
	}
});

// Create scrollLeft and scrollTop methods
jQuery.each( { scrollLeft: "pageXOffset", scrollTop: "pageYOffset" }, function( method, prop ) {
	var top = /Y/.test( prop );

	jQuery.fn[ method ] = function( val ) {
		return access( this, function( elem, method, val ) {
			var win = getWindow( elem );

			if ( val === undefined ) {
				return win ? (prop in win) ? win[ prop ] :
					win.document.documentElement[ method ] :
					elem[ method ];
			}

			if ( win ) {
				win.scrollTo(
					!top ? val : jQuery( win ).scrollLeft(),
					top ? val : jQuery( win ).scrollTop()
				);

			} else {
				elem[ method ] = val;
			}
		}, method, val, arguments.length, null );
	};
});

// Add the top/left cssHooks using jQuery.fn.position
// Webkit bug: https://bugs.webkit.org/show_bug.cgi?id=29084
// getComputedStyle returns percent when specified for top/left/bottom/right
// rather than make the css module depend on the offset module, we just check for it here
jQuery.each( [ "top", "left" ], function( i, prop ) {
	jQuery.cssHooks[ prop ] = addGetHookIf( support.pixelPosition,
		function( elem, computed ) {
			if ( computed ) {
				computed = curCSS( elem, prop );
				// if curCSS returns percentage, fallback to offset
				return rnumnonpx.test( computed ) ?
					jQuery( elem ).position()[ prop ] + "px" :
					computed;
			}
		}
	);
});


// Create innerHeight, innerWidth, height, width, outerHeight and outerWidth methods
jQuery.each( { Height: "height", Width: "width" }, function( name, type ) {
	jQuery.each( { padding: "inner" + name, content: type, "": "outer" + name }, function( defaultExtra, funcName ) {
		// margin is only for outerHeight, outerWidth
		jQuery.fn[ funcName ] = function( margin, value ) {
			var chainable = arguments.length && ( defaultExtra || typeof margin !== "boolean" ),
				extra = defaultExtra || ( margin === true || value === true ? "margin" : "border" );

			return access( this, function( elem, type, value ) {
				var doc;

				if ( jQuery.isWindow( elem ) ) {
					// As of 5/8/2012 this will yield incorrect results for Mobile Safari, but there
					// isn't a whole lot we can do. See pull request at this URL for discussion:
					// https://github.com/jquery/jquery/pull/764
					return elem.document.documentElement[ "client" + name ];
				}

				// Get document width or height
				if ( elem.nodeType === 9 ) {
					doc = elem.documentElement;

					// Either scroll[Width/Height] or offset[Width/Height] or client[Width/Height], whichever is greatest
					// unfortunately, this causes bug #3838 in IE6/8 only, but there is currently no good, small way to fix it.
					return Math.max(
						elem.body[ "scroll" + name ], doc[ "scroll" + name ],
						elem.body[ "offset" + name ], doc[ "offset" + name ],
						doc[ "client" + name ]
					);
				}

				return value === undefined ?
					// Get width or height on the element, requesting but not forcing parseFloat
					jQuery.css( elem, type, extra ) :

					// Set width or height on the element
					jQuery.style( elem, type, value, extra );
			}, type, chainable ? margin : undefined, chainable, null );
		};
	});
});


// The number of elements contained in the matched element set
jQuery.fn.size = function() {
	return this.length;
};

jQuery.fn.andSelf = jQuery.fn.addBack;




// Register as a named AMD module, since jQuery can be concatenated with other
// files that may use define, but not via a proper concatenation script that
// understands anonymous AMD modules. A named AMD is safest and most robust
// way to register. Lowercase jquery is used because AMD module names are
// derived from file names, and jQuery is normally delivered in a lowercase
// file name. Do this after creating the global so that if an AMD module wants
// to call noConflict to hide this version of jQuery, it will work.

// Note that for maximum portability, libraries that are not jQuery should
// declare themselves as anonymous modules, and avoid setting a global if an
// AMD loader is present. jQuery is a special case. For more information, see
// https://github.com/jrburke/requirejs/wiki/Updating-existing-libraries#wiki-anon

if ( typeof define === "function" && define.amd ) {
	define( "jquery", [], function() {
		return jQuery;
	});
}




var
	// Map over jQuery in case of overwrite
	_jQuery = window.jQuery,

	// Map over the $ in case of overwrite
	_$ = window.$;

jQuery.noConflict = function( deep ) {
	if ( window.$ === jQuery ) {
		window.$ = _$;
	}

	if ( deep && window.jQuery === jQuery ) {
		window.jQuery = _jQuery;
	}

	return jQuery;
};

// Expose jQuery and $ identifiers, even in
// AMD (#7102#comment:10, https://github.com/jquery/jquery/pull/557)
// and CommonJS for browser emulators (#13566)
if ( typeof noGlobal === strundefined ) {
	window.jQuery = window.$ = jQuery;
}




return jQuery;

}));

},{}],36:[function(require,module,exports){
var can = require("../../../dist/cjs/can.js");

can.Component.extend({
	tag: "hello-world",
	template: "{{message}}",
	scope: {
		message: "Hello World"
	}
});

window.can= can;

},{"../../../dist/cjs/can.js":1}]},{},[36]);
