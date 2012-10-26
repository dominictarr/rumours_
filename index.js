var parserx      = require('parse-regexp')
var EventEmitter = require('events').EventEmitter
var MuxDemux     = require('mux-demux')
var remember     = require('remember')
var idle         = require('idle')
var timestamp    = require('monotonic-timestamp')

module.exports = Rumours

//THIS IS STRICTLY FOR DEBUGGING
var ids = 'ABCDEFHIJKLMNOP'
function createId () {
  var id = ids[0]
  ids = ids.substring(1)
  return id
}

function Rumours (schema) {
  var emitter = new EventEmitter()
  //DEBUG
  emitter.id = createId() 
  var rules = []
  var live = {}
  var locals = {}
  /* schema must be of form:
  { '/regexp/g': function (key) {
      //must return a scuttlebutt instance
      //regexes must match from the first character.
      //[else madness would ensue]
    }
  }
  */

  for (var p in schema) {
    rules.push({rx: parserx(p) || p, fn: schema[p]})
  }

  function match (key) {
    for (i in rules) {
      var r = rules[i]
      var m = key.match(r.rx)
      if(m && m.index === 0)
        return r.fn
    }
  }

  //OPEN is a much better verb than TRANSCIEVE
  emitter.open = 
  emitter.transceive =
  emitter.trx = function (key, local, cb) {
    if(!cb && 'function' === typeof local)
      cb = local, local = true
    local = (local !== false) //default to true
    if(local) locals[key] = true    
    if(live[key]) return live[key]

    var fn = match(key)
    if(!fn) throw new Error('no schema for:'+key)
    var doc = fn(key) //create instance.
    doc.key = key
    live[key] = doc //remeber what is open.
    emitter.emit('open', doc, local) //attach to any open streams.
    emitter.emit('trx', doc, local)
    doc.once('dispose', function () {
      console.log('dispose', emitter.id, doc.key)
      delete locals[doc.key]
      delete live[doc.key]      
    })
    if(cb) doc.once('sync', cb)
    return doc
  }

  //CLOSE(doc)
  emitter.close = 
  emitter.untransceive =
  emitter.untrx = function (doc) {
    doc.dispose()
    emitter.emit('untrx', doc)
    emitter.emit('close', doc)
    return this
  }

  /*
    so the logic here:
    if open a doc,
      RTR over stream;
      if idle
        close stream
      if change
        reopen stream
  */

  function activations (listen) {
    emitter.on('open', onActive)
    for(var key in live) {
      (onActive)(live[key])
    }

    function onActive (doc, local) {
      local = (local !== false)
      var up = true
      function onUpdate () {
        if(up) return
        up = true
        listen(doc, true)
      }
      function onIdle () {
        up = false
        listen(doc, false)
      }
      idle(doc, 'update', 1e3, onIdle)
      doc.once('dispose', function () {
        if(up) {
          up = false
          listen(doc, false)
        }
        doc.removeListener('update', onIdle)
        doc.removeListener('update', onUpdate)
      })
      doc.on('update', onUpdate)

      listen(doc, true)
    }
  }

  emitter.createStream = function (mode) {

    var streams = {}
    var mx = MuxDemux(function (stream) {
      if(_stream = streams[stream.meta.key]) {
        if(_stream.meta.ts > stream.meta.ts)
          return _stream.end()
        else
          stream.end(), stream = _stream
      }
      streams[stream.meta.key] = stream
      //this will trigger connectIf
      emitter.open(stream.meta.key, false)
    })
    
    function connectIf(doc) {
        var stream = streams[doc.key]
        console.log(emitter.id, 'connectIf')
        if(!stream) {
          streams[doc.key] = stream = 
            mx.createStream({key: doc.key, ts: timestamp()})
        }
        console.log(emitter.id, 'createStream', stream.id)
        stream.pipe(doc.createStream({wrapper:'raw', tail: true})).pipe(stream)
        stream.once('close', function () {
          delete streams[doc.key]
        })
    }

    //replicate all live documents.
    process.nextTick(function () {
      activations(function (doc, up) {
        console.log(emitter.id, 'ACTIVE', up, doc.key)
        if(up) {
          process.nextTick(function () {
            connectIf(doc)
          })
        } else {
          if(streams[doc.key])
            streams[doc.key].end()
          console.log(locals)
          if(!locals[doc.key])
            doc.dispose()
        }
      })
    })

    return mx
  }

  //inject kv object used to persist everything.
  emitter.persist = function (kv) {
    var sync = remember(kv)
    function onActive (doc) {
      sync(doc)
    }
    //check if any docs are already active.
    //start persisting them.
    for (var k in live) {
      onActive(live[k])
    }
    emitter.on('trx', onActive)
  }
  return emitter
}
