var parserx      = require('parse-regexp')
var EventEmitter = require('events').EventEmitter
var MuxDemux     = require('mux-demux')
var remember     = require('remember')
var idle         = require('idle')
var timestamp    = require('monotonic-timestamp')
var from         = require('from')

var es           = require('event-stream')

var sync         = require('./state-sync')
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

  /* schema must be of form :
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
    for (var i in rules) {
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

    //if we havn't emitted ready, emit it now,
    //can deal with the rest of the updates later...
    if(!emitter.ready) {
      emitter.ready = true
      emitter.emit('ready')
    }

    var fn = match(key)
    if(!fn) throw new Error('no schema for:'+key)
    var doc = fn(key) //create instance.
    doc.key = key
    live[key] = doc //remeber what is open.
    emitter.emit('open', doc, local) //attach to any open streams.
    emitter.emit('trx', doc, local)
    doc.once('dispose', function () {
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
      function onUpdate (u) {
        if(up) return
        up = true
        listen(doc, true)
      }
      function onIdle () {
        up = false
        listen(doc, false)
      }
      //call onIdle when _update hasn't occured within ms...
      idle(doc, '_update', 1e3, onIdle)
      doc.once('dispose', function () {
        if(up) {
          up = false
          listen(doc, false)
        }
        doc.removeListener('_update', onIdle)
        doc.removeListener('_update', onUpdate)
      })
      doc.on('_update', onUpdate)

      listen(doc, true)
    }
  }

  var state = {}
  var syncState = sync(emitter, state)

  //a better name for this?
  function onReadyOrNow (cb) { 
    process.nextTick(function () {
      if(emitter.ready)  return cb()
      emitter.once('ready', cb)
    })
  }

  emitter.createStream = function (mode) {
    var streams = {}
    var mx = MuxDemux(function (stream) {
      if(/^__state/.test(stream.meta.key)) {
        return stateStream(stream)
      }
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
        if(!stream) {
          streams[doc.key] = stream = 
            mx.createStream({key: doc.key, ts: timestamp()})
        }        
        stream.pipe(doc.createStream({wrapper:'raw', tail: true})).pipe(stream)

        stream.once('close', function () {
          delete streams[doc.key]
        })
    }

    //replicate all live documents.
    process.nextTick(function () {
      activations(function (doc, up) {
        if(up) {
          process.nextTick(function () {
            connectIf(doc)
          })
        } else {
          if(streams[doc.key])
            streams[doc.key].end()

          if(!locals[doc.key])
            doc.dispose()
        }
      })
    })

    function stateStream (stream) {
      stream.on('data', function (ary) {
        var key = ary.shift()
        var hash = ary.shift()
        if(state[key] !== hash && !live[key]) {
          //(_, false) means close this again after it stops changing...
          emitter.open(key, false)
        }
      })
    }

    //wait untill is ready, if not yet ready...
    onReadyOrNow(function () {

      from(
        Object.keys(state).map(function (k) {
          return [k, state[k]]
        })
      )
      .pipe(mx.createStream({key: '__state'}))

      /*.on('data', function (data) {
        var key  = data.shift()
        var hash = data.shift()
        //just have to open the document,
        //and it will be replicated to the remote.
        if(state[key] !== hash)
          emitter.open(key)
      })*/

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

    //load the state - this is the hash of the documents!
    syncState(kv)
    return emitter
  }

  return emitter
}
