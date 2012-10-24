
var parserx = require('parse-regexp')
var EventEmitter = require('events').EventEmitter
var MuxDemux = require('mux-demux')

module.exports = Rumours

function Rumours (schema) {
  var emitter = new EventEmitter()
  var rules = []
  var live = {}

  /* schema must be of form:
  { '/regexp/f': function (key) {
      //must return a scuttlebutt instance
    } }
  */

  for (var p in schema) {
    rules.push({rx: parserx(p) || p, fn: schema[p]})
  }

  function match (key) {
    for (i in rules) {
      var r = rules[i]
      var m = key.match(r.rx)
      console.log(m, r, key)
      if(m && m.index === 0)
        return r.fn
    }
  }

  //TRANSCEIVE
  emitter.transceive =
  emitter.trx = function (key, cb) {
    if(live[key]) return live[key]
    var fn = match(key)
    if(!fn) throw new Error('no schema for:'+key)
    var doc = fn(key) //create instance.
    doc.key = key
    live[key] = doc //remeber what is open.
    emitter.emit('trx', doc) //attach to any open streams.

    if(cb) doc.once('sync', cb)
    return doc
  }

  emitter.untransceive =
  emitter.untrx = function (doc) {
    delete live[doc.key]
    emitter.emit('untrx', doc)
    return this
  }

  /*
    So, right now, I'm just replicating each live document.

    When you connect, it's necessary to sync all documents.
    use a Merkle Tree.

    do this is parallel with the open documents 
    (because that is much more important, we want that to work live)

    only do disk IO when something changes.

    that is a little bit more complicated than just reading 
    and writing.

    also, you may want to compact. 
    maybe we want some smart compacting on the client, 
    to optimize for localStorage.

    next: TESTS?, persistence, efficient-replication?

    this is basically integration, so don't go overboard with tests.
    test the modules. just lite integration testing.
  */

  emitter.createStream = function (mode) {
    var streams = {}
    function onConnection (stream, local) {
      //when a stream comes in, replicate it to the local 
      var doc
      try {
        doc = emitter.trx(stream.meta)
      } catch (err) {
        return stream.error(stream)
      }
      //this works for in-memory stuff.
      stream.pipe(doc.createStream()).pipe(stream)
      //TODO: if document is not live,
      //pause the incoming, until the document is synced.
      //that will need a refactor of mux-demux to use duplex instead of through...
    }
    var mx = MuxDemux(onConnection)
    //replicate all live documents.
    process.nextTick(function () {
      for (var key in live) {
        onConnection(mx.createStream(key), true)
      }
    })
    return mx
  }
  return emitter
}

