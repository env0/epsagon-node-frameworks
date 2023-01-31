"use strict";

function _interopDefault(e) {
    return e && "object" == typeof e && "default" in e ? e.default : e;
}

var e = _interopDefault(require("async_hooks")), t = _interopDefault(require("epsagon")), r = _interopDefault(require("semver")), n = _interopDefault(require("node-schedule")), a = _interopDefault(require("uuid4")), s = _interopDefault(require("shimmer")), o = _interopDefault(require("os")), i = _interopDefault(require("http")), c = _interopDefault(require("https"));

const {eventInterface: u, tracer: d, utils: l} = t, p = !r.satisfies(process.version, "^8.13 || >=10.14.2");

let g = !0, h = {};

const f = new WeakMap;

function destroyAsync(e) {
    if (h[e] && h[e].mainAsyncIds.has(e)) {
        const t = h[e];
        t.relatedAsyncIds.forEach((e => {
            delete h[e];
        })), t.relatedAsyncIds.clear(), t.mainAsyncIds.clear();
    }
}

function initAsync(e, t, r, n) {
    h[r] && (h[e] = h[r], h[e].relatedAsyncIds.add(e)), !p || "TCPWRAP" !== t && "HTTPPARSER" !== t || (destroyAsync(f.get(n)), 
    f.set(n, e));
}

function get() {
    return h[e.executionAsyncId()] || null;
}

var m = {
    get: get,
    init: function() {
        e.createHook({
            init: initAsync,
            destroy: destroyAsync,
            promiseResolve: destroyAsync
        }).enable(), d.getTrace = get;
    },
    setAsyncReference: function(t) {
        if (!t) return;
        const r = e.executionAsyncId();
        h[r] = t, h[r].relatedAsyncIds.add(r);
    },
    destroyAsync: destroyAsync,
    RunInContext: function(t, r) {
        const n = t();
        return null != n && (n.relatedAsyncIds = new Set, n.mainAsyncIds = new Set, h[e.executionAsyncId()] = n), 
        r();
    },
    privateClearTracers: function(e) {
        Object.keys(h).length > e && (l.debugLog(`[resource-monitor] found ${Object.keys(h).length}, deleting`), 
        Object.values(h).forEach((e => {
            e.currRunner && u.addToMetadata(e.currRunner, {
                instrum_cleared_hourly: !0
            });
        })), h = {});
    },
    privateCheckTTLConditions: function(e) {
        const t = [ ...new Set(Object.values(h)) ].filter((t => e(t)));
        t.length && (l.debugLog(`[resource-monitor] found ${t.length} tracers to remove`), 
        l.debugLog(`[resource-monitor] tracers before delete: ${Object.values(h).length}`), 
        t.forEach((e => {
            e.currRunner && u.addToMetadata(e.currRunner, {
                instrum_cleared_ttl: !0
            }), e.relatedAsyncIds.forEach((e => {
                delete h[e];
            }));
        })), l.debugLog(`[resource-monitor] tracers after delete: ${Object.values(h).length}`));
    },
    disableTracing: function() {
        g = !1;
    },
    isTracingEnabled: function() {
        return g;
    },
    setMainReference: function(t = !0) {
        const r = e.executionAsyncId();
        h[r] && (t ? h[r].mainAsyncIds.add(r) : h[r].mainAsyncIds.delete(r));
    }
};

const b = parseInt(process.env.EPSAGON_RESOURCE_MAX_TRACERS || "50", 10), y = parseInt(process.env.EPSAGON_RESOURCE_MAX_TRACER_TTL || "300", 10), E = process.env.EPSAGON_RESOURCE_TTL_CHECK_CRON || "*/5 * * * *", v = process.env.EPSAGON_RESOURCE_CLEAR_TRACERS_CRON || "0 * * * *";

n.scheduleJob("checkTTL", E, (function() {
    m.privateCheckTTLConditions((function(e) {
        return !(!e || !e.createdAt) && (Date.now() - e.createdAt) / 1e3 > y;
    }));
})), n.scheduleJob("clearTracers", v, (function() {
    m.privateClearTracers(b);
}));

let T = [];

const R = {
    "user-agent": "elb-healthchecker/2.0"
}, _ = [ "txt", "html", "jpg", "png", "css", "js", "jsx", "woff", "woff2", "ttf", "eot", "ico" ];

var q = {
    ignoreEndpoints: function(e) {
        T = e;
    },
    ignoredEndpoints: function() {
        return T;
    },
    extractEpsagonHeader: function(e) {
        return e && e["epsagon-trace-id"];
    },
    EPSAGON_HEADER: "epsagon-trace-id",
    shouldIgnore: function(e, t) {
        let r = !1;
        return t && (r = Object.keys(R).map((e => {
            const r = Object.keys(t).find((t => t.toLowerCase() === e));
            return r && t[r].toLowerCase() === R[e];
        })).includes(!0)), !!_.includes(e.split(".").pop()) || (T.filter((t => e.startsWith(t))).length > 0 || r);
    }
};

const {utils: L, eventInterface: C, event: x, errorCode: M} = t, {extractEpsagonHeader: A} = q;

var w = {
    createRunner: function(e, t) {
        const r = new x.Event([ `hapi-${a()}`, L.createTimestampFromTime(t), null, "runner", 0, M.ErrorCode.OK ]), n = new x.Resource([ e.url.host, "hapi", e.method ]);
        return r.setResource(n), C.createTraceIdMetadata(r), r;
    },
    finishRunner: function(e, t, r, n) {
        e.setDuration(L.createDurationTimestamp(n)), C.addToMetadata(e, {
            url: t.url.href,
            route: t.route.path,
            query: t.url.search,
            status_code: r.statusCode
        }, {
            request_headers: t.headers,
            params: t.params,
            response_headers: r.headers
        }), A(t.headers) && C.addToMetadata(e, {
            http_trace_id: A(t.headers)
        }), r.statusCode >= 500 && e.setErrorCode(M.ErrorCode.EXCEPTION);
    }
};

const {tracer: k, utils: I, eventInterface: W, moduleUtils: P} = t, {shouldIgnore: S} = q, O = [ "hapi-swagger", "hapi-pino", "@hapi/inert", "@hapi/vision" ];

function handleResponse(e, t, r, n, a) {
    m.setMainReference();
    try {
        w.finishRunner(e, t, r, n), a && W.setException(e, a);
    } catch (e) {
        k.addException(e);
    }
    k.sendTrace((() => {}));
}

function hapiMiddleware(e, t, r) {
    const n = k.getTrace();
    let a;
    m.setAsyncReference(n), k.restart();
    const s = Date.now();
    try {
        a = w.createRunner(e, s), k.addRunner(a);
    } catch (n) {
        return I.debugLog(n), r(e, t);
    }
    const {label: o, setError: i, getTraceUrl: c} = k;
    e.epsagon = {
        label: o,
        setError: i,
        getTraceUrl: c
    };
    const u = r(e, t);
    return S(e.route.path, e.headers) ? (I.debugLog(`Ignoring request: ${e.route.path}`), 
    u) : (I.isPromise(u) ? u.then((() => {
        m.setAsyncReference(n), handleResponse(a, e, u, s);
    })).catch((t => {
        m.setAsyncReference(n), handleResponse(a, e, u, s, t);
    })) : handleResponse(a, e, u, s), u);
}

function hapiRouteWrapper(e) {
    return function() {
        return Array.isArray(arguments[0]) || (arguments[0] = [ arguments[0] ]), arguments[0].forEach((e => {
            if (!e.handler) return;
            const t = e.handler;
            e.handler = (e, r) => m.RunInContext(k.createTracer, (() => hapiMiddleware(e, r, t)));
        })), e.apply(this, arguments);
    };
}

function hapiCloneWrapper(e) {
    return function(t) {
        const r = e.apply(this, [ t ]);
        return O.includes(t) || r.route && s.wrap(r, "route", hapiRouteWrapper), r;
    };
}

function hapiServerWrapper(e) {
    return function() {
        const t = e.apply(this, arguments);
        return t.route && s.wrap(t, "route", hapiRouteWrapper), t._clone && s.wrap(t, "_clone", hapiCloneWrapper), 
        t;
    };
}

var U = {
    init() {
        P.patchModule("@hapi/hapi", "server", hapiServerWrapper), P.patchModule("hapi", "server", hapiServerWrapper), 
        P.patchModule("hapi", "Server", hapiServerWrapper);
    }
};

const {utils: D, eventInterface: z, event: N, errorCode: H} = t, {extractEpsagonHeader: $} = q;

var j = {
    createRunner: function(e, t) {
        const r = new N.Event([ `express-${a()}`, D.createTimestampFromTime(t), null, "runner", 0, H.ErrorCode.OK ]), n = new N.Resource([ e.hostname, "express", e.method ]);
        return r.setResource(n), z.createTraceIdMetadata(r), r;
    },
    finishRunner: function(e, t, r, n) {
        if (z.addToMetadata(e, {
            url: `${r.protocol}://${r.hostname}${r.originalUrl}`,
            status_code: t.statusCode
        }, {
            request_headers: r.headers,
            response_headers: t.getHeaders()
        }), r.query && Object.keys(r.query).length && z.addToMetadata(e, {
            query: r.query
        }), r.params && Object.keys(r.params).length && z.addToMetadata(e, {}, {
            params: r.params
        }), r.body && Object.keys(r.body).length && z.addToMetadata(e, {}, {
            request_data: r.body
        }), r.route) {
            const t = r.route.path instanceof Array ? function(e) {
                let t;
                return e.route.path.forEach((r => {
                    (function(e, t) {
                        if (e.length !== t.length) return !1;
                        for (let r = 0; r < t.length; r += 1) if (e[r] !== t[r] && e[r] && ":" !== e[r][0]) return !1;
                        return !0;
                    })(r.split("/"), e.path.split("/")) && (t = r);
                })), t;
            }(r) : r.route.path;
            t && z.addToMetadata(e, {
                route_path: r.baseUrl + t
            });
        }
        $(r.headers) && z.addToMetadata(e, {
            http_trace_id: $(r.headers)
        }), t.statusCode >= 500 && e.setErrorCode(H.ErrorCode.EXCEPTION), e.setDuration(D.createDurationTimestamp(n));
    }
}, G = {
    methods: {
        methods: [ "get", "post", "put", "head", "delete", "options", "trace", "copy", "lock", "mkcol", "move", "purge", "propfind", "proppatch", "unlock", "report", "mkactivity", "checkout", "merge", "m-search", "notify", "subscribe", "unsubscribe", "patch", "search", "connect" ]
    }
};

const {tracer: B, utils: F, moduleUtils: K, eventInterface: J} = t, {shouldIgnore: X} = q, {methods: Q} = G;

function handleExpressRequestFinished(e, t, r, n, a, s) {
    if (m.setAsyncReference(t), m.setMainReference(), F.debugLog("[express] - got close event, handling response"), 
    "TRUE" === (process.env.EPSAGON_ALLOW_NO_ROUTE || "").toUpperCase() || e.route) {
        try {
            j.finishRunner(r, s, e, n), F.debugLog("[express] - finished runner");
        } catch (e) {
            B.addException(e);
        }
        F.debugLog("[express] - sending trace"), B.sendTrace((() => {}), t).then(a).then((() => {
            F.debugLog("[express] - trace sent + request resolved");
        }));
    } else F.debugLog("[express] - req.route not set - not reporting trace");
}

function expressMiddleware(e, t, r) {
    m.setMainReference(), F.debugLog("[express] - starting express middleware");
    const n = B.getTrace();
    if (n || F.debugLog("[express] - no tracer found on init"), X(e.originalUrl, e.headers)) return F.debugLog(`Ignoring request: ${e.originalUrl}`), 
    void r();
    let a;
    B.restart();
    const s = Date.now();
    try {
        a = j.createRunner(e, s), F.debugLog("[express] - created runner");
        const o = t.json;
        t.json = e => (e && "string" == typeof e && J.addToMetadata(a, {}, {
            response_data: e
        }), t.json = o, o.call(t, e));
        const i = new Promise((r => {
            let o = !1;
            m.setAsyncReference(n), F.debugLog("[express] - creating response promise"), t.once("close", (function() {
                o || (o = !0, handleExpressRequestFinished(e, n, a, s, r, this));
            })), t.once("finish", (function() {
                o || (o = !0, handleExpressRequestFinished(e, n, a, s, r, this));
            }));
        }));
        B.addRunner(a, i), F.debugLog("[express] - added runner");
        const {label: c, setError: u, getTraceUrl: d} = B;
        e.epsagon = {
            label: c,
            setError: u,
            getTraceUrl: d
        }, m.setMainReference(!1);
    } catch (e) {
        F.debugLog("[express] - general catch"), F.debugLog(e);
    } finally {
        F.debugLog("[express] - general finally"), r();
    }
}

function getWrappedNext(e) {
    const t = [ ...e ], r = t[t.length - 1];
    return r && "next" === r.name && (t[t.length - 1] = function(e) {
        const t = B.getTrace(), r = e;
        return function(e) {
            F.debugLog("[express] - middleware executed"), e && F.debugLog(e), m.setAsyncReference(t);
            return r(...arguments);
        };
    }(e[e.length - 1])), t;
}

function middlewareWrapper(e) {
    return 4 === e.length ? function(t, r, n, a) {
        const s = B.getTrace();
        return s && s.currRunner && J.setException(s.currRunner, t), e.apply(this, getWrappedNext(arguments));
    } : function(t, r, n) {
        return e.apply(this, getWrappedNext(arguments));
    };
}

function methodWrapper(e) {
    return function() {
        for (let e = 0; e < arguments.length - 1; e += 1) arguments[e] && "function" == typeof arguments[e] && (arguments[e] = middlewareWrapper(arguments[e]));
        return e.apply(this, arguments);
    };
}

function useWrapper(e) {
    return function() {
        return arguments.length > 1 && arguments[1] && "function" == typeof arguments[1] && (arguments[1] = middlewareWrapper(arguments[1])), 
        e.apply(this, arguments);
    };
}

function expressWrapper(e) {
    return F.debugLog("[express] - wrapping express"), function() {
        F.debugLog("[express] - express app created");
        const t = e.apply(this, arguments);
        return F.debugLog("[express] - called the original function"), this.use(((e, t, r) => m.isTracingEnabled() ? m.RunInContext(B.createTracer, (() => expressMiddleware(e, t, r))) : r())), 
        t;
    };
}

function expressListenWrapper(e) {
    return function() {
        const t = e.apply(this, arguments);
        return this.use(((e, t, r, n) => m.isTracingEnabled() && e ? (t && t.epsagon && t.epsagon.setError({
            name: "Error",
            message: e.message,
            stack: e.stack
        }), n(e)) : n())), t;
    };
}

var V = {
    init() {
        K.patchModule("express", "init", expressWrapper, (e => e.application)), K.patchModule("express", "listen", expressListenWrapper, (e => e.application)), 
        K.patchModule("express", "use", useWrapper, (e => e.Router));
        for (let e = 0; e < Q.length; e += 1) K.patchModule("express", Q[e], methodWrapper, (e => e.Route.prototype));
    }
};

const {utils: Y, eventInterface: Z, event: ee, errorCode: te} = t, {extractEpsagonHeader: re} = q;

var ne = {
    createRunner: function(e, t) {
        const r = new ee.Event([ `koa-${a()}`, Y.createTimestampFromTime(t), null, "runner", 0, te.ErrorCode.OK ]), n = new ee.Resource([ e.hostname, "koa", e.method ]);
        return r.setResource(n), Z.createTraceIdMetadata(r), r;
    },
    finishRunner: function(e, t, r, n) {
        Z.addToMetadata(e, {
            url: `${r.protocol}://${r.hostname}${r.path}`,
            query: r.query,
            status_code: t.status
        }, {
            request_headers: r.headers,
            response_headers: t.headers
        }), re(r.headers) && Z.addToMetadata(e, {
            http_trace_id: re(r.headers)
        }), t.status >= 500 && e.setErrorCode(te.ErrorCode.EXCEPTION), e.setDuration(Y.createDurationTimestamp(n));
    }
};

const {tracer: ae, utils: se, moduleUtils: oe} = t, {shouldIgnore: ie} = q;

async function koaMiddleware(e, t) {
    if (ie(e.request.originalUrl, e.request.headers)) return se.debugLog(`Ignoring request: ${e.request.originalUrl}`), 
    void await t();
    let r;
    ae.restart();
    const n = Date.now();
    try {
        r = ne.createRunner(e.request, n);
        const a = new Promise((t => {
            e.res.once("finish", (() => {
                if (404 !== e.response.status) {
                    try {
                        ne.finishRunner(r, e.response, e.request, n);
                    } catch (e) {
                        ae.addException(e);
                    }
                    ae.sendTrace((() => {})).then(t);
                }
            }));
        }));
        ae.addRunner(r, a);
        const {label: s, setError: o, getTraceUrl: i} = ae;
        e.epsagon = {
            label: s,
            setError: o,
            getTraceUrl: i
        };
    } catch (e) {
        se.debugLog(e);
    } finally {
        await t();
    }
}

function koaWrapper(e) {
    return function() {
        const t = e.apply(this, arguments);
        return this.__EPSAGON_PATCH || (this.__EPSAGON_PATCH = !0, this.use(((e, t) => m.RunInContext(ae.createTracer, (() => koaMiddleware(e, t))))), 
        this.on("error", (async (e, t) => {
            t.epsagon && await t.epsagon.setError(e);
        }))), t;
    };
}

var ce = {
    init() {
        oe.patchModule("koa/lib/application.js", "use", koaWrapper, (e => e.prototype));
    }
};

const {tracer: ue, moduleUtils: de, eventInterface: le, utils: pe} = t;

function pubSubSubscriberWrapper(e) {
    return function(t, r) {
        if ("message" !== t) return e.apply(this, [ t, r ]);
        const n = this;
        return e.apply(this, [ t, e => m.RunInContext(ue.createTracer, (() => function(e, t, r) {
            let n;
            try {
                ue.restart();
                const {slsEvent: a, startTime: s} = le.initializeEvent("pubsub", r.projectId, "messagePullingListener", "trigger");
                ue.addEvent(a);
                const o = e.id, i = {
                    messageId: o
                };
                let c = {};
                a.setId(o);
                const u = e.data && JSON.parse(`${e.data}`);
                u && "object" == typeof u && (c = u), le.finalizeEvent(a, s, null, i, c);
                const {label: d, setError: l, getTraceUrl: p} = ue;
                e.epsagon = {
                    label: d,
                    setError: l,
                    getTraceUrl: p
                };
                const {slsEvent: g, startTime: h} = le.initializeEvent("node_function", "message_handler", "execute", "runner");
                let f;
                try {
                    f = t(e, {});
                } catch (e) {
                    n = e;
                }
                const m = t.name;
                if (m && g.getResource().setName(m), pe.isPromise(f)) {
                    let e;
                    f.catch((t => {
                        throw e = t, t;
                    })).finally((() => {
                        le.finalizeEvent(g, h, e), ue.sendTrace((() => {}));
                    }));
                } else le.finalizeEvent(g, h, n), ue.sendTrace((() => {}));
                ue.addRunner(g, f);
            } catch (e) {
                ue.addException(e);
            }
            if (n) throw n;
        }(e, r, n))) ]);
    };
}

var ge = {
    init() {
        de.patchModule("@google-cloud/pubsub/build/src/subscription", "on", pubSubSubscriberWrapper, (e => e.Subscription.prototype));
    }
};

const {tracer: he, moduleUtils: fe, eventInterface: me, utils: be} = t, ye = "Client", Ee = "unknown", ve = "_INBOX";

function natsSubscribeWrapper(e, t, r) {
    return function(n, a, s) {
        const {opts_internal: o, callback_internal: i} = ((e, t) => {
            let r = e, n = t;
            return "function" == typeof e && (n = e, r = void 0), {
                opts_internal: r,
                callback_internal: n
            };
        })(a, s);
        let c = i;
        try {
            const e = (e => !(!e || "string" != typeof e || !e.startsWith(ve)))(n);
            c = (n, a, s, o) => {
                m.RunInContext(he.createTracer, (() => function(e, t, r, n, a, s, o, i) {
                    let c, u;
                    try {
                        he.restart();
                        const {slsEvent: d, startTime: l} = me.initializeEvent("nats", r, i ? "requestMessageListener" : "subscribeMessageListener", "trigger");
                        he.addEvent(d);
                        const p = {}, g = {};
                        if (o && (p.server_host_name = o), r && (p.subject = r), n && (p.sid = n), e && (g.msg = e, 
                        s && "object" == typeof e && "TRUE" === (process.env.EPSAGON_PROPAGATE_NATS_ID || "").toUpperCase())) {
                            const {epsagon_id: t} = e;
                            t && (p.epsagon_id = t);
                        }
                        t && (g.reply = t), me.finalizeEvent(d, l, null, p, g);
                        const {slsEvent: h, startTime: f} = me.initializeEvent("node_function", i ? "requestMessagHandler" : "subscribeMessageHandler", "messageReceived", "runner");
                        try {
                            u = a(e, t, r, n);
                        } catch (e) {
                            c = e;
                        }
                        const m = a.name;
                        if (m && h.getResource().setName(m), be.isPromise(u)) {
                            let e;
                            u = u.catch((t => {
                                throw e = t, t;
                            })).finally((() => {
                                me.finalizeEvent(h, f, e), he.sendTrace((() => {}));
                            }));
                        } else me.finalizeEvent(h, f, c), he.sendTrace((() => {}));
                        he.addRunner(h, u);
                    } catch (e) {
                        he.addException(e);
                    }
                    if (c) throw c;
                    return u;
                }(n, a, s, o, i, r, t, e)));
            };
        } catch (e) {
            he.addException(e);
        }
        return e.apply(this, [ n, o, c ]);
    };
}

function natsConnectWrapper(e) {
    return function(t, r) {
        const n = e.apply(this, [ t, r ]);
        try {
            if (n && n.constructor) {
                if (n.constructor.name !== ye) return n;
                const e = n.options ? n.options.json : null, t = (a = n.currentServer).url && a.url.hostname ? a.url.hostname : Ee;
                s.wrap(n, "subscribe", (() => natsSubscribeWrapper(n.subscribe, t, e)));
            }
        } catch (e) {
            he.addException(e);
        }
        var a;
        return n;
    };
}

var Te = {
    init() {
        fe.patchModule("nats", "connect", natsConnectWrapper);
    }
};

const {tracer: Re, moduleUtils: _e, eventInterface: qe, utils: Le} = t, {EPSAGON_HEADER: Ce} = q;

function kafkaMiddleware(e, t, r) {
    let n, a;
    try {
        const s = Re.getTrace();
        m.setAsyncReference(s), Re.restart();
        const o = r ? e.batch : e, {slsEvent: i, startTime: c} = qe.initializeEvent("kafka", o.topic, "consume", "trigger"), u = r ? o.messages : [ e.message ], d = u.slice(0, 50).map((e => ({
            offset: e.offset,
            timestamp: new Date(parseInt(e.timestamp, 10)).toUTCString(),
            headers: Object.entries(e.headers).reduce(((e, t) => (e[t[0]] = t[1].toString(), 
            e)), {}),
            body: e.value.toString()
        }))), l = [];
        u.forEach((e => {
            e.headers && e.headers[Ce] && !l.includes(e.headers[Ce].toString()) && l.push(e.headers[Ce].toString());
        })), Re.addEvent(i), qe.finalizeEvent(i, c, null, {
            "messaging.kafka.partition": o.partition,
            "messaging.messages_count": u.length,
            "epsagon.trace_ids": l
        }, {
            "messaging.messages": d
        });
        const {label: p, setError: g, getTraceUrl: h} = Re;
        e.epsagon = {
            label: p,
            setError: g,
            getTraceUrl: h
        };
        const f = `${o.topic}_${r ? "batch" : "message"}_handler`, {slsEvent: b, startTime: y} = qe.initializeEvent("node_function", f, "execute", "runner");
        s.currRunner = b;
        try {
            a = t(e);
        } catch (e) {
            n = e;
        }
        if (Le.isPromise(a)) {
            let e;
            a = a.catch((t => {
                throw e = t, t;
            })).finally((() => {
                m.setAsyncReference(s), m.setMainReference(), qe.finalizeEvent(b, y, e), Re.sendTrace((() => {}));
            }));
        } else m.setMainReference(), qe.finalizeEvent(b, y, n), Re.sendTrace((() => {}));
        Re.addRunner(b, a);
    } catch (e) {
        Re.addException(e);
    }
    if (n) throw n;
    return a;
}

function kafkaConsumerRunWrapper(e) {
    return function(t) {
        if (t.eachMessage) {
            const e = t.eachMessage, patchedHandler = t => m.RunInContext(Re.createTracer, (() => kafkaMiddleware(t, e, !1)));
            t.eachMessage = patchedHandler.bind(t);
        }
        if (t.eachBatch) {
            const e = t.eachBatch, patchedHandler = t => m.RunInContext(Re.createTracer, (() => kafkaMiddleware(t, e, !0)));
            t.eachBatch = patchedHandler.bind(t);
        }
        return e.apply(this, [ t ]);
    };
}

function kafkaConsumerWrapper(e) {
    return function(t) {
        const r = e.apply(this, [ t ]);
        return r.run && s.wrap(r, "run", kafkaConsumerRunWrapper), r;
    };
}

var xe = {
    init() {
        _e.patchModule("kafkajs", "consumer", kafkaConsumerWrapper, (e => e.Kafka.prototype));
    }
};

const {tracer: Me, moduleUtils: Ae, eventInterface: we, utils: ke} = t, {EPSAGON_HEADER: Ie} = q;

function kafkaConsumerRunWrapper$1(e) {
    return function(t, r) {
        const n = this;
        if ("message" !== t) return e.apply(this, [ t, r ]);
        if ("function" != typeof r) return e.apply(this, [ t, r ]);
        return e.apply(this, [ t, e => m.RunInContext(Me.createTracer, (() => function(e, t, r) {
            let n, a;
            try {
                Me.restart();
                const {slsEvent: s, startTime: o} = we.initializeEvent("kafka", e.topic, "consume", "trigger"), i = {
                    partition: e.partition,
                    offset: e.offset,
                    key: e.key,
                    host: r.client.options.kafkaHost
                };
                try {
                    const t = JSON.parse(e.value);
                    t[Ie] && (i[Ie] = t[Ie].toString());
                } catch (e) {
                    ke.debugLog("kafka-node - Could not extract epsagon header");
                }
                Me.addEvent(s), we.finalizeEvent(s, o, null, i, {
                    body: e.value.toString()
                });
                const {label: c, setError: u, getTraceUrl: d} = Me;
                e.epsagon = {
                    label: c,
                    setError: u,
                    getTraceUrl: d
                };
                const {slsEvent: l, startTime: p} = we.initializeEvent("node_function", t.name || `${e.topic}-consumer`, "execute", "runner");
                try {
                    a = t(e);
                } catch (e) {
                    n = e;
                }
                if (ke.isPromise(a)) {
                    let e;
                    a = a.catch((t => {
                        throw e = t, t;
                    })).finally((() => {
                        we.finalizeEvent(l, p, e), Me.sendTrace((() => {}));
                    }));
                } else we.finalizeEvent(l, p, n), Me.sendTrace((() => {}));
                Me.addRunner(l, a);
            } catch (e) {
                Me.addException(e);
            }
            if (n) throw n;
            return a;
        }(e, r, n))) ]);
    };
}

var We = {
    init() {
        Ae.patchModule("kafka-node", "on", kafkaConsumerRunWrapper$1, (e => e.Consumer.prototype));
    }
};

const {tracer: Pe, moduleUtils: Se, eventInterface: Oe, utils: Ue, sqsUtils: De} = t;

function sqsConsumerWrapper(e) {
    return function(t) {
        Ue.debugLog("sqs-consumer - inside wrapper"), Ue.debugLog(`sqs-consumer - options: ${t}`);
        const r = e.apply(this, [ t ]), patchedCallback = (e, t) => m.RunInContext(Pe.createTracer, (() => function(e, t, r) {
            Ue.debugLog("sqs-consumer - starting middleware");
            const n = Array.isArray(e) ? e[0] : e;
            let a, s;
            try {
                Pe.restart();
                const {queueName: o, awsAccount: i, region: c} = function(e) {
                    let t = "", r = "", n = "";
                    if (e.startsWith("https://vpce")) {
                        const [r, a, s, o] = e.split("/");
                        n = s.split(".")[2], t = o;
                    } else {
                        const [a, s, o, i, c] = e.split("/");
                        t = c, r = i, n = o.split(".")[1];
                    }
                    return {
                        queueName: t,
                        awsAccount: r,
                        region: n
                    };
                }(r.queueUrl);
                Ue.debugLog("sqs-consumer - parsed queue url", o, i, c);
                const {slsEvent: u, startTime: d} = Oe.initializeEvent("sqs", o, Array.isArray(e) ? "ReceiveMessages" : "ReceiveMessage", "trigger");
                Pe.addEvent(u), Oe.finalizeEvent(u, d, null, {
                    aws_account: i,
                    region: c,
                    md5_of_message_body: n.MD5OfBody,
                    message_id: n.MessageId
                }, {
                    message_body: n.Body,
                    message_attributed: n.MessageAttributes
                }), Ue.debugLog("sqs-consumer - created sqs event");
                const l = De.getSNSTrigger([ n ]);
                null != l && (Ue.debugLog("sqs-consumer - created sns event"), Oe.addToMetadata(u, {
                    "SNS Trigger": l
                }));
                const {label: p, setError: g, getTraceUrl: h} = Pe;
                n.epsagon = {
                    label: p,
                    setError: g,
                    getTraceUrl: h
                };
                const {slsEvent: f, startTime: m} = Oe.initializeEvent("node_function", "message_handler", "execute", "runner");
                Ue.debugLog("sqs-consumer - initialized runner event");
                try {
                    s = r.originalHandleMessage(e, t), Ue.debugLog("sqs-consumer - executed original handler");
                } catch (e) {
                    Ue.debugLog("sqs-consumer - error in original handler"), a = e;
                }
                if (r.originalHandleMessage.name && (Ue.debugLog("sqs-consumer - set handler name"), 
                f.getResource().setName(r.originalHandleMessage.name)), Ue.isPromise(s)) {
                    let e;
                    Ue.debugLog("sqs-consumer - result is promise"), s.catch((t => {
                        throw Ue.debugLog("sqs-consumer - original handler threw error"), e = t, t;
                    })).finally((() => {
                        Ue.debugLog("sqs-consumer - finalizing event"), Oe.finalizeEvent(f, m, e), Ue.debugLog("sqs-consumer - sending trace"), 
                        Pe.sendTrace((() => {})).then((() => {
                            Ue.debugLog("sqs-consumer - trace sent");
                        })), Ue.debugLog("sqs-consumer - post send");
                    }));
                } else Ue.debugLog("sqs-consumer - response not promise"), Ue.debugLog("sqs-consumer - finalizing event"), 
                Oe.finalizeEvent(f, m, a), Ue.debugLog("sqs-consumer - sending trace"), Pe.sendTrace((() => {})).then((() => {
                    Ue.debugLog("sqs-consumer - trace sent");
                })), Ue.debugLog("sqs-consumer - post send");
                Pe.addRunner(f, s), Ue.debugLog("sqs-consumer - added runner");
            } catch (e) {
                Ue.debugLog(`sqs-consumer - general error ${e}`), Pe.addException(e);
            }
            if (a) throw Ue.debugLog("sqs-consumer - rethrowing original sync error"), a;
            return s;
        }(e, t, r)));
        return t.handleMessage ? (Ue.debugLog("sqs-consumer - wrapping handleMessage"), 
        r.originalHandleMessage = r.handleMessage, r.handleMessage = patchedCallback) : t.handleMessageBatch && (Ue.debugLog("sqs-consumer - wrapping handleMessageBatch"), 
        r.originalHandleMessage = r.handleMessageBatch, r.handleMessageBatch = patchedCallback), 
        Ue.debugLog("sqs-consumer - done wrapper"), r;
    };
}

var ze = {
    init() {
        Se.patchModule("sqs-consumer", "create", sqsConsumerWrapper, (e => e.Consumer));
    }
};

const {tracer: Ne, moduleUtils: He, eventInterface: $e, utils: je} = t, {EPSAGON_HEADER: Ge} = q;

function amqplibConsumerWrapper(e) {
    return function(t, r, n, a) {
        const s = this;
        let o = r;
        return "function" == typeof r && (o = e => e && e.properties && "object" == typeof e.properties.headers && e.properties.headers.bunnyBus ? (je.debugLog("[amqplib] Skipping BunnyBus messages"), 
        r(e)) : m.RunInContext(Ne.createTracer, (() => function(e, t, r) {
            let n, a, s, o;
            const i = Ne.getTrace();
            try {
                if (e && e.properties && "object" == typeof e.properties.headers && e.properties.headers.bunnyBus) return je.debugLog("[amqplib] Skipping BunnyBus messages"), 
                t(e);
                m.setAsyncReference(i), Ne.restart();
                const {slsEvent: n, startTime: a} = $e.initializeEvent("rabbitmq", e.fields.routingKey, "consume", "trigger");
                je.debugLog("[amqplib] Done initializing event");
                const c = {
                    exchange: e.fields.exchange,
                    redelivered: e.fields.redelivered,
                    host: r.connection.stream._host,
                    consumer_tag: e.fields.consumerTag
                };
                e.properties.headers[Ge] && (c[Ge] = e.properties.headers[Ge].toString()), Ne.addEvent(n), 
                je.debugLog("[amqplib] Event added"), $e.finalizeEvent(n, a, null, c, {
                    headers: e.properties.headers,
                    message: e.content.toString()
                });
                const {label: u, setError: d, getTraceUrl: l} = Ne;
                e.epsagon = {
                    label: u,
                    setError: d,
                    getTraceUrl: l
                };
                const p = t && t.name ? t.name : `${e.fields.routingKey}-consumer`, {slsEvent: g, startTime: h} = $e.initializeEvent("node_function", p, "execute", "runner");
                s = g, o = h, je.debugLog("[amqplib] Runner initialized");
            } catch (e) {
                je.debugLog("[amqplib] Exception initializing"), Ne.addException(e);
            }
            try {
                a = t(e), je.debugLog("[amqplib] Original runner ran");
            } catch (e) {
                je.debugLog("[amqplib] Original runner got an error"), n = e;
            }
            try {
                if (s) {
                    if (je.isPromise(a)) {
                        let e;
                        je.debugLog("[amqplib] Original runner is a promise"), a = a.catch((t => {
                            throw je.debugLog("[amqplib] Original runner in catch"), e = t, t;
                        })).finally((() => {
                            m.setMainReference(), je.debugLog("[amqplib] Original runner in finally"), $e.finalizeEvent(s, o, e), 
                            Ne.sendTrace((() => {})), je.debugLog("[amqplib] Trace sent");
                        }));
                    } else m.setAsyncReference(i), m.setMainReference(), je.debugLog("[amqplib] Original runner is not a promise"), 
                    $e.finalizeEvent(s, o, n), Ne.sendTrace((() => {}));
                    je.debugLog("[amqplib] Runner added"), Ne.addRunner(s, a);
                }
            } catch (e) {
                je.debugLog("[amqplib] Exception adding runner"), Ne.addException(e);
            }
            if (n) throw n;
            return je.debugLog("[amqplib] Return result"), a;
        }(e, r, s)))), e.apply(this, [ t, o, n, a ]);
    };
}

var Be = {
    init() {
        He.patchModule("amqplib/lib/callback_model.js", "consume", amqplibConsumerWrapper, (e => e.Channel.prototype)), 
        He.patchModule("amqplib/lib/channel_model.js", "consume", amqplibConsumerWrapper, (e => e.Channel.prototype));
    }
};

const {tracer: Fe, moduleUtils: Ke, eventInterface: Je, utils: Xe} = t, {EPSAGON_HEADER: Qe} = q;

function amqpSubscribeWrapper(e) {
    return function(t, r, n) {
        const a = this, s = "function" == typeof t ? t : r;
        let o = s;
        return "function" == typeof s && (o = (e, t, r, n) => m.RunInContext(Fe.createTracer, (() => function(e, t, r, n, a, s) {
            let o, i, c, u;
            try {
                if ("object" == typeof r && r.bunnyBus) return Xe.debugLog("[amqp] Skipping BunnyBus messages"), 
                s(t, r, n, a);
                Fe.restart();
                const {slsEvent: o, startTime: i} = Je.initializeEvent("rabbitmq", n.routingKey, "consume", "trigger");
                Xe.debugLog("[amqp] Done initializing event");
                const d = {
                    exchange: n.exchange,
                    redelivered: n.redelivered,
                    queue: n.queue,
                    host: e.connection.options.host,
                    vhost: e.connection.options.vhost,
                    consumer_tag: n.consumerTag
                };
                r[Qe] && (d[Qe] = r[Qe].toString()), Fe.addEvent(o), Xe.debugLog("[amqp] Event added"), 
                Je.finalizeEvent(o, i, null, d, {
                    headers: r,
                    message: JSON.stringify(t)
                });
                const {label: l, setError: p, getTraceUrl: g} = Fe;
                t.epsagon = {
                    label: l,
                    setError: p,
                    getTraceUrl: g
                };
                const h = s && s.name ? s.name : `${n.routingKey}-consumer`, {slsEvent: f, startTime: m} = Je.initializeEvent("node_function", h, "execute", "runner");
                c = f, u = m, Xe.debugLog("[amqp] Runner initialized");
            } catch (e) {
                Xe.debugLog("[amqp] Exception initializing"), Fe.addException(e);
            }
            try {
                i = s(t, r, n, a), Xe.debugLog("[amqp] Original runner ran");
            } catch (e) {
                Xe.debugLog("[amqp] Original runner got an error"), o = e;
            }
            try {
                if (c) {
                    if (Xe.isPromise(i)) {
                        let e;
                        Xe.debugLog("[amqp] Original runner is a promise"), i = i.catch((t => {
                            throw Xe.debugLog("[amqp] Original runner in catch"), e = t, t;
                        })).finally((() => {
                            Xe.debugLog("[amqp] Original runner in finally"), Je.finalizeEvent(c, u, e), Fe.sendTrace((() => {})), 
                            Xe.debugLog("[amqp] Trace sent");
                        }));
                    } else Xe.debugLog("[amqp] Original runner is not a promise"), Je.finalizeEvent(c, u, o), 
                    Fe.sendTrace((() => {}));
                    Xe.debugLog("[amqp] Runner added"), Fe.addRunner(c, i);
                }
            } catch (e) {
                Xe.debugLog("[amqp] Exception adding runner"), Fe.addException(e);
            }
            if (o) throw o;
            return Xe.debugLog("[amqp] Return result"), i;
        }(a, e, t, r, n, s)))), "function" == typeof t ? t = o : r = o, e.apply(this, [ t, r, n ]);
    };
}

var Ve = {
    init() {
        Ke.patchModule("amqp/lib/queue.js", "subscribe", amqpSubscribeWrapper, (e => e.prototype));
    }
};

const {tracer: Ye, moduleUtils: Ze, eventInterface: et, utils: tt} = t, {EPSAGON_HEADER: rt} = q;

function bunnybusConsumerWrapper(e) {
    return function({queue: t, handlers: r, options: n}) {
        if (!t) return tt.debugLog("Found BunnyBus <7.0.0, skipping instrumentation."), 
        e.apply(this, [ {
            queue: t,
            handlers: r,
            options: n
        } ]);
        try {
            const e = this;
            e.__EPSAGON_PATCH = {}, Object.keys(r).forEach((t => {
                const n = r[t];
                "function" == typeof r[t] && e.__EPSAGON_PATCH && !e.__EPSAGON_PATCH[t] && (e.__EPSAGON_PATCH[t] = !0, 
                r[t] = e => m.RunInContext(Ye.createTracer, (() => function(e, t, r, n, a) {
                    let s, o;
                    try {
                        const r = Ye.getTrace();
                        m.setAsyncReference(r), Ye.restart();
                        const {slsEvent: i, startTime: c} = et.initializeEvent("rabbitmq", a.metaData.headers.routeKey, "consume", "trigger"), u = {
                            host: e.hostname,
                            vhost: e.vhost,
                            "messaging.message_payload_size_bytes": JSON.stringify(a.message).length
                        };
                        a.metaData.headers[rt] && (u[rt] = a.metaData.headers[rt].toString()), Ye.addEvent(i), 
                        et.finalizeEvent(i, c, null, u, {
                            headers: a.metaData.headers,
                            message: a.message
                        });
                        const {label: d, setError: l, getTraceUrl: p} = Ye;
                        a.epsagon = {
                            label: d,
                            setError: l,
                            getTraceUrl: p
                        };
                        const g = t && t.name ? t.name : `${n}-consumer`, {slsEvent: h, startTime: f} = et.initializeEvent("node_function", g, "execute", "runner");
                        et.createTraceIdMetadata(h);
                        try {
                            o = t(a);
                        } catch (e) {
                            s = e;
                        }
                        if (tt.isPromise(o)) {
                            let e;
                            o = o.catch((t => {
                                throw e = t, t;
                            })).finally((() => {
                                m.setAsyncReference(r), m.setMainReference(), et.finalizeEvent(h, f, e), Ye.sendTrace((() => {}));
                            }));
                        } else m.setMainReference(), et.finalizeEvent(h, f, s), Ye.sendTrace((() => {}));
                        Ye.addRunner(h, o);
                    } catch (e) {
                        Ye.addException(e);
                    }
                    if (s) throw s;
                    return o;
                }(this.config, n, 0, t, e))));
            }));
        } catch (e) {
            tt.debugLog(`Could not enable BunnyBus tracing - ${e}`);
        }
        return e.apply(this, [ {
            queue: t,
            handlers: r,
            options: n
        } ]);
    };
}

var nt = {
    init() {
        Ze.patchModule("@tenna-llc/bunnybus/lib/index.js", "subscribe", bunnybusConsumerWrapper, (e => e.prototype));
    }
};

const {tracer: at, moduleUtils: st, eventInterface: ot, utils: it, httpHelpers: ct} = t, {EPSAGON_HEADER: ut} = q;

function superagentWrapper(e) {
    return function(t, r, n) {
        const a = e.apply(this, [ t, r, n ]);
        try {
            const {hostname: e, pathname: r} = new URL(t), {slsEvent: n, startTime: s} = ot.initializeEvent("http", e, a.method, "http"), o = ct.generateEpsagonTraceId();
            "TRUE" !== (process.env.EPSAGON_DISABLE_HTTP_TRACE_ID || "").toUpperCase() && a.set(ut, o), 
            ot.addToMetadata(n, {
                url: t,
                http_trace_id: o
            }, {
                path: r
            });
            const i = new Promise((e => {
                a.once("end", (() => {
                    ot.addToMetadata(n, {
                        status_code: a.res.statusCode
                    }, {
                        request_headers: a.header,
                        response_headers: a.res.headers
                    }), ct.setJsonPayload(n, "request_body", a._data), ct.setJsonPayload(n, "response_body", a.res.text, a.res.headers["content-encoding"]), 
                    n.setDuration(it.createDurationTimestamp(s)), e();
                }));
            }));
            at.addEvent(n, i);
        } catch (e) {
            at.addException(e);
        }
        return a;
    };
}

var dt = {
    init() {
        [ "post", "get", "put", "patch", "delete" ].forEach((e => {
            st.patchModule("superagent", e, superagentWrapper);
        }));
    }
};

const {tracer: lt, moduleUtils: pt, eventInterface: gt, utils: ht, httpHelpers: ft} = t, {EPSAGON_HEADER: mt} = q;

function superagentWrapper$1(e) {
    return function(t) {
        const r = e.apply(this, [ t ]);
        try {
            const {hostname: e, pathname: r} = new URL(t.url), {slsEvent: n, startTime: a} = gt.initializeEvent("http", e, t.method, "http"), s = ft.generateEpsagonTraceId();
            "TRUE" !== (process.env.EPSAGON_DISABLE_HTTP_TRACE_ID || "").toUpperCase() && (t.header[mt] = s), 
            gt.addToMetadata(n, {
                url: t.url,
                http_trace_id: s
            }, {
                request_headers: t.header,
                path: r
            });
            const o = new Promise((e => {
                t.once("response", (t => {
                    gt.addToMetadata(n, {
                        status_code: t.statusCode
                    }, {
                        response_headers: t.headers
                    }), ft.setJsonPayload(n, "response_body", t.text, t.headers["content-encoding"]), 
                    n.setDuration(ht.createDurationTimestamp(a)), e();
                }));
            }));
            lt.addEvent(n, o);
        } catch (e) {
            lt.addException(e);
        }
        return r;
    };
}

var bt = {
    init() {
        pt.patchModule("@tenna-llc/superagent-wrapper", "_setDefaults", superagentWrapper$1, (e => e.ProxyAgent.prototype));
    }
};

const {tracer: yt, moduleUtils: Et} = t;

function redisClientWrapper(e) {
    return function(t) {
        try {
            if (!1 === this.ready || !1 === this.stream.writable) return e.apply(this, [ t ]);
            const r = yt.getTrace(), {callback: n} = t;
            t.callback = (e, t) => {
                m.setAsyncReference(r), n && n(e, t);
            };
        } catch (e) {
            yt.addException(e);
        }
        return e.apply(this, [ t ]);
    };
}

var vt = {
    init() {
        Et.patchModule("redis", "internal_send_command", redisClientWrapper, (e => e.RedisClient.prototype));
    }
};

const {tracer: Tt, moduleUtils: Rt} = t;

function mysqlQueryWrapper(e) {
    return function(t, r, n) {
        try {
            let a, s, o = !1;
            const i = Tt.getTrace();
            t.onResult ? (s = t.values, a = t.onResult) : ({params: s, callback: a} = function(e, t) {
                const r = void 0 === t && e instanceof Function;
                return {
                    params: r ? [] : e,
                    callback: r ? e : t
                };
            }(r, n)), void 0 === a && t._callback && (a = t._callback, o = !0);
            const patchedCallback = (e, t, r) => {
                m.setAsyncReference(i), a && a(e, t, r);
            };
            return t.onResult && (t.onResult = patchedCallback), o && (t._callback = patchedCallback), 
            e.apply(this, [ t, s, a && !o ? patchedCallback : n ]);
        } catch (e) {
            Tt.addException(e);
        }
        return e.apply(this, [ t, r, n ]);
    };
}

function mysqlGetConnectionWrapper(e) {
    return function(t) {
        let r = t;
        try {
            const e = Tt.getTrace();
            r = (r, n) => {
                m.setAsyncReference(e), t && t(r, n);
            };
        } catch (e) {
            Tt.addException(e);
        }
        return e.apply(this, [ r ]);
    };
}

var _t = {
    init() {
        Rt.patchModule("mysql2", "query", mysqlQueryWrapper, (e => e.Connection.prototype)), 
        Rt.patchModule("mysql2", "execute", mysqlQueryWrapper, (e => e.Connection.prototype)), 
        Rt.patchModule("mysql/lib/Connection.js", "query", mysqlQueryWrapper, (e => e.prototype)), 
        Rt.patchModule("mysql/lib/Pool.js", "getConnection", mysqlGetConnectionWrapper, (e => e.prototype));
    }
};

const {tracer: qt, moduleUtils: Lt} = t;

function mongodbAsyncPasser(...e) {
    const t = e[e.length - 1], r = e[e.length - 2];
    let n = r;
    try {
        const e = qt.getTrace();
        n = (t, n) => {
            m.setAsyncReference(e), r && r(t, n);
        };
    } catch (e) {
        qt.addException(e);
    }
    return arguments[e.length - 2] = n, Array.prototype.pop.apply(arguments), t.apply(this, arguments);
}

function mongodbWrapper(e) {
    return function(...t) {
        return mongodbAsyncPasser(...t, e);
    };
}

function mongodbCommandWrapper(e) {
    return function(...t) {
        const r = t[2];
        return r && r.ismaster ? e.apply(this, t) : mongodbAsyncPasser(...t, e);
    };
}

var Ct = {
    init() {
        Lt.patchModule("mongodb/lib/core/wireprotocol/index.js", "insert", mongodbWrapper, (e => e)), 
        Lt.patchModule("mongodb/lib/core/wireprotocol/index.js", "update", mongodbWrapper, (e => e)), 
        Lt.patchModule("mongodb/lib/core/wireprotocol/index.js", "remove", mongodbWrapper, (e => e)), 
        Lt.patchModule("mongodb/lib/core/wireprotocol/index.js", "query", mongodbWrapper, (e => e)), 
        Lt.patchModule("mongodb/lib/core/wireprotocol/index.js", "getMore", mongodbWrapper, (e => e)), 
        Lt.patchModule("mongodb/lib/core/wireprotocol/index.js", "command", mongodbCommandWrapper, (e => e));
    }
};

const {tracer: xt, moduleUtils: Mt, eventInterface: At, utils: wt} = t;

function websocketEmitterWrapper(e) {
    return function(t, r) {
        if ("message" !== t) return e.apply(this, [ t, r ]);
        const n = this;
        return e.apply(this, [ t, e => m.RunInContext(xt.createTracer, (() => function(e, t, r) {
            let n;
            try {
                xt.restart();
                const {slsEvent: s, startTime: o} = At.initializeEvent("websocket", (a = r._socket) ? a.localAddress : "websocket", "messagePullingListener", "trigger");
                xt.addEvent(s);
                const i = {
                    message: e
                };
                At.finalizeEvent(s, o, null, i);
                const {slsEvent: c, startTime: u} = At.initializeEvent("node_function", "message_handler", "execute", "runner");
                let d;
                At.createTraceIdMetadata(c);
                const {label: l, setError: p, setWarning: g, getTraceUrl: h} = xt;
                xt.addRunner(c);
                try {
                    d = t(e, {
                        label: l,
                        setError: p,
                        setWarning: g,
                        getTraceUrl: h
                    });
                } catch (e) {
                    n = e;
                }
                const f = t.name;
                if (f && c.getResource().setName(f), wt.isPromise(d)) {
                    let e;
                    xt.addPendingEvent(c, d), d.catch((t => {
                        throw e = t, t;
                    })).finally((() => {
                        At.finalizeEvent(c, u, e), xt.sendTrace((() => {}));
                    }));
                } else At.finalizeEvent(c, u, n), xt.sendTrace((() => {}));
            } catch (e) {
                xt.addException(e);
            }
            var a;
            if (n) throw n;
        }(e, r, n))) ]);
    };
}

var kt = {
    init() {
        Mt.patchModule("ws", "on", websocketEmitterWrapper, (e => e.prototype));
    }
};

const {utils: It, eventInterface: Wt, event: Pt, errorCode: St} = t, {extractEpsagonHeader: Ot} = q;

var Ut = {
    createRunner: function(e, t) {
        const r = new Pt.Event([ `restify-${a()}`, It.createTimestampFromTime(t), null, "runner", 0, St.ErrorCode.OK ]), n = new Pt.Resource([ e.headers.host, "restify", e.method ]);
        return r.setResource(n), Wt.createTraceIdMetadata(r), r;
    },
    finishRunner: function(e, t, r, n, a) {
        e.setDuration(It.createDurationTimestamp(n)), Wt.addToMetadata(e, {
            url: t.url,
            route: t.route.path,
            status_code: r.statusCode
        }, {
            request_headers: t.headers,
            params: t.params,
            response_headers: r.headers
        }), Ot(t.headers) && Wt.addToMetadata(e, {
            http_trace_id: Ot(t.headers)
        }), a && Wt.setException(e, a), r.statusCode >= 500 && e.setErrorCode(St.ErrorCode.EXCEPTION);
    }
};

const {tracer: Dt, utils: zt, moduleUtils: Nt} = t, {shouldIgnore: Ht} = q, $t = [ "get", "post", "put", "patch", "head", "opts", "del" ];

function restifyWrapper(e) {
    return function(t, r) {
        const n = r;
        return e.apply(this, [ t, (e, t, r) => m.RunInContext(Dt.createTracer, (() => function(e, t, r, n) {
            let a, s, o, i = Promise.resolve();
            const c = Date.now();
            try {
                if (Ht(e.url, e.headers)) return zt.debugLog(`Ignoring request: ${e.url}`), n(e, t, r);
                Dt.restart(), o = Ut.createRunner(e, c), Dt.addRunner(o);
                const {label: u, setError: d, getTraceUrl: l} = Dt;
                e.epsagon = {
                    label: u,
                    setError: d,
                    getTraceUrl: l
                };
                try {
                    s = n(e, t, r);
                } catch (e) {
                    a = e;
                }
                if (zt.isPromise(s)) {
                    let r;
                    s = s.catch((e => {
                        throw r = e, e;
                    })).finally((() => {
                        Ut.finishRunner(o, e, t, c, r), Dt.sendTrace((() => {}));
                    }));
                } else Ut.finishRunner(o, e, t, c, a), i = Dt.sendTrace((() => {}));
            } catch (e) {
                Dt.addException(e);
            }
            return a ? (i.then((() => {
                throw a;
            })), s) : s;
        }(e, t, r, n))) ]);
    };
}

var jt = {
    init() {
        for (let e = 0; e < $t.length; e += 1) Nt.patchModule("restify/lib/server", $t[e], restifyWrapper, (e => e.prototype));
    }
};

const {utils: Gt, eventInterface: Bt, event: Ft, errorCode: Kt} = t, {extractEpsagonHeader: Jt} = q;

var Xt = {
    createRunner: function(e, t) {
        const r = new Ft.Event([ `fastify-${a()}`, Gt.createTimestampFromTime(t), null, "runner", 0, Kt.ErrorCode.OK ]), n = new Ft.Resource([ e.hostname, "fastify", e.method ]);
        return r.setResource(n), Bt.createTraceIdMetadata(r), r;
    },
    finishRunner: function(e, t, r, n, a) {
        Bt.addToMetadata(e, {
            url: `${r.protocol}://${r.hostname}${r.url}`,
            status_code: t.statusCode
        }, {
            request_headers: r.headers,
            response_headers: t.getHeaders()
        }), r.query && Object.keys(r.query).length && Bt.addToMetadata(e, {
            query: r.query
        }), r.params && Object.keys(r.params).length && Bt.addToMetadata(e, {}, {
            params: r.params
        }), a && Object.keys(a).length && Bt.addToMetadata(e, {}, {
            request_data: a
        }), r.routerPath && Bt.addToMetadata(e, {
            route: r.routerPath
        }), Jt(r.headers) && Bt.addToMetadata(e, {
            http_trace_id: Jt(r.headers)
        }), t.statusCode >= 500 && e.setErrorCode(Kt.ErrorCode.EXCEPTION), e.setDuration(Gt.createDurationTimestamp(n));
    }
};

const {tracer: Qt, utils: Vt, moduleUtils: Yt, eventInterface: Zt} = t, {shouldIgnore: er} = q;

function handleResponse$1(e, t, r, n, a, s) {
    m.setAsyncReference(e), m.setMainReference(), Vt.debugLog("[fastify] - got close event, handling response");
    try {
        Xt.finishRunner(t, r, n, a), Vt.debugLog("[fastify] - finished runner");
    } catch (e) {
        Qt.addException(e);
    }
    Vt.debugLog("[fastify] - sending trace"), Qt.sendTrace((() => {}), e).then(s).then((() => {
        Vt.debugLog("[fastify] - trace sent + request resolved");
    }));
}

function fastifyMiddleware(e, t) {
    m.setMainReference(), Vt.debugLog("[fastify] - starting middleware");
    const r = Qt.getTrace();
    if (r || Vt.debugLog("[fastify] - no tracer found on init"), er(e.url, e.headers)) return void Vt.debugLog(`Ignoring request: ${e.url}`);
    let n;
    Qt.restart();
    const a = Date.now();
    try {
        n = Xt.createRunner(e, a), Vt.debugLog("[fastify] - created runner");
        const s = new Promise((s => {
            let o = !1;
            m.setAsyncReference(r), Vt.debugLog("[fastify] - creating response promise"), t.raw.once("finish", (() => {
                Vt.debugLog(`[fastify] - got to finish event. isFinished=${o}`), o || (o = !0, handleResponse$1(r, n, t, e, a, s));
            })), t.raw.once("close", (() => {
                Vt.debugLog(`[fastify] - got to close event. isFinished=${o}`), o || (o = !0, handleResponse$1(r, n, t, e, a, s));
            }));
        }));
        e.context._EPSAGON_EVENT = n, e.context._originalErrorHandler || (e.context._originalErrorHandler = e.context.errorHandler, 
        e.context.errorHandler = (t, r, n) => {
            Zt.setException(r.context._EPSAGON_EVENT, t), e.context._originalErrorHandler(t, r, n);
        }), Qt.addRunner(n, s), Vt.debugLog("[fastify] - added runner");
        const {label: o, setError: i, setWarning: c, getTraceUrl: u} = Qt;
        e.epsagon = {
            label: o,
            setError: i,
            setWarning: c,
            getTraceUrl: u
        }, m.setMainReference(!1);
    } catch (e) {
        Vt.debugLog("[fastify] - general catch"), Vt.debugLog(e);
    } finally {
        Vt.debugLog("[fastify] - general finally");
    }
}

function fastifyWrapper(e) {
    return Vt.debugLog("[fastify] - wrapping"), function(t, r, n, a, s) {
        try {
            if (s && s instanceof Function && "runPreParsing" !== s.name) return Vt.debugLog("[fastify] - incoming callback type is not runPreParsing"), 
            e.apply(this, arguments);
            Vt.debugLog("[fastify] - incoming request"), m.isTracingEnabled() && m.RunInContext(Qt.createTracer, (() => fastifyMiddleware(n, a)));
        } catch (e) {
            Vt.debugLog(`[fastify] - failed wrapping ${e}`);
        }
        return Vt.debugLog("[fastify] - calling the original function"), e.apply(this, arguments);
    };
}

var tr = {
    init() {
        Yt.patchModule("fastify/lib/hooks.js", "hookRunner", fastifyWrapper);
    }
};

const {utils: rr, eventInterface: nr, event: ar, errorCode: sr, httpHelpers: or} = t, {extractEpsagonHeader: ir} = q;

var cr = {
    createRunner: function(e, t) {
        const r = new ar.Event([ `http-server-${a()}`, rr.createTimestampFromTime(t), null, "runner", 0, sr.ErrorCode.OK ]), n = new ar.Resource([ e.headers.host || o.hostname(), "http-server", e.method ]);
        return r.setResource(n), nr.createTraceIdMetadata(r), r;
    },
    finishRunner: function(e, t, r, n, a, s) {
        nr.addToMetadata(e, {
            url: `${a}://${r.headers.host}${r.url}`,
            status_code: t.statusCode
        }, {
            request_headers: r.headers,
            response_headers: t.getHeaders()
        }), ir(r.headers) && nr.addToMetadata(e, {
            http_trace_id: ir(r.headers)
        }), s && s.length && or.setJsonPayload(e, "request_body", Buffer.concat(s)), t.statusCode >= 500 && e.setErrorCode(sr.ErrorCode.EXCEPTION), 
        e.setDuration(rr.createDurationTimestamp(n));
    }
};

const {tracer: ur, utils: dr, httpHelpers: lr} = t, {shouldIgnore: pr} = q;

function httpServerMiddleware(e, t, r, n) {
    m.setMainReference(), dr.debugLog("[http-server] - starting middleware");
    const a = ur.getTrace();
    if (a || dr.debugLog("[http-server] - no tracer found on init"), pr(e.url, e.headers)) return dr.debugLog(`Ignoring request: ${e.url}`), 
    r(e, t);
    let s;
    ur.restart();
    const o = [], i = Date.now();
    try {
        s = cr.createRunner(e, i), dr.debugLog("[http-server] - created runner"), "TRUE" === (process.env.EPSAGON_ENABLE_HTTP_BODY || "").toUpperCase() && e.on("data", (e => {
            lr.addChunk(e, o);
        }));
        const r = new Promise((r => {
            m.setAsyncReference(a), dr.debugLog("[http-server] - creating response promise"), 
            t.once("finish", (function() {
                !function(e, t, r, n, a, s, o, i) {
                    m.setAsyncReference(t), m.setMainReference(), dr.debugLog("[http-server] - got close event, handling response");
                    try {
                        cr.finishRunner(r, s, e, n, o, i), dr.debugLog("[http-server] - finished runner");
                    } catch (e) {
                        ur.addException(e);
                    }
                    dr.debugLog("[http-server] - sending trace"), ur.sendTrace((() => {}), t).then(a).then((() => {
                        dr.debugLog("[http-server] - trace sent + request resolved");
                    }));
                }(e, a, s, i, r, this, n, o);
            }));
        }));
        ur.addRunner(s, r), dr.debugLog("[http-server] - added runner");
        const {label: c, setError: u, getTraceUrl: d} = ur;
        e.epsagon = {
            label: c,
            setError: u,
            getTraceUrl: d
        }, m.setMainReference(!1);
    } catch (e) {
        dr.debugLog("[http-server] - general catch"), dr.debugLog(e);
    } finally {
        dr.debugLog("[http-server] - general finally");
    }
    return r(e, t);
}

function httpServerWrapper(e, t) {
    return dr.debugLog("[http-server] - wrapping"), function(r, n) {
        const a = n || r, s = n ? r : void 0;
        return e.apply(this, [ s, (e, r) => m.isTracingEnabled() ? m.RunInContext(ur.createTracer, (() => httpServerMiddleware(e, r, a, t))) : a ]);
    };
}

var gr = {
    init() {
        "TRUE" === (process.env.EPSAGON_TRACE_HTTP_SERVER || "").toUpperCase() && (s.wrap(i, "createServer", (e => httpServerWrapper(e, "http"))), 
        s.wrap(c, "createServer", (e => httpServerWrapper(e, "https"))));
    }
};

const {config: hr, utils: fr} = t, mr = {
    express: V,
    hapi: U,
    koa: ce,
    pubsub: ge,
    nats: Te,
    kafkajs: xe,
    kafkanode: We,
    sqsconsumer: ze,
    amqplib: Be,
    amqp: Ve,
    bunnybus: nt,
    superagent: dt,
    superagentWrapper: bt,
    redis: vt,
    ws: kt,
    restify: jt,
    mysql: _t,
    mongodb: Ct
};

function patch(e) {
    try {
        e.init();
    } catch (e) {
        "TRUE" === (process.env.EPSAGON_DEBUG || "").toUpperCase() && fr.debugLog(e);
    }
}

hr.getConfig().isEpsagonPatchDisabled || (m.init(), hr.getConfig().patchWhitelist ? hr.getConfig().patchWhitelist.forEach((e => {
    mr[e] ? (fr.debugLog(`[FRM-PATCHER] Whitelisting ${e}`), patch(mr[e])) : fr.debugLog(`[FRM-PATCHER] Unable to find lib to patch: ${e}`);
})) : [ V, U, ce, ge, Te, xe, We, ze, Be, Ve, nt, dt, bt, vt, kt, jt, tr, _t, Ct, gr ].forEach(patch)), 
t.disableAll = () => {
    t.unpatch(), m.disableTracing();
}, t.ignoreEndpoints = q.ignoreEndpoints;

var br = t;

module.exports = br;
