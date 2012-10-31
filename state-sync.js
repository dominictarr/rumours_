var sha1sum = require('sha1sum')

module.exports = function (emitter, state) {
  //vvv will all be refactored out. 
  //using this right now, to get a MVP going. 
  //later, replace with a merkle tree.
  //track changes in doc...
  emitter.on('open', function (doc) {
    function onUpdate () {
      console.log('update', doc.key, sha1sum(doc.sources))
      emitter.emit('_change', doc.key, sha1sum(doc.sources))
    }
    doc.on('_update', onUpdate)
    doc.once('dispose', function () {
      doc.removeListener('_update', onUpdate)
    })
  })

  emitter.on('_change', function (key, hash) {
    state[key] = hash
  })

  //refactor this out to use a correctly commutative datastructure here.
  return function syncState(kv) {
    var STATE = '__state'
    kv.has(STATE, function (_, stat) {
      //there is a little race condition here,
      //because this isn't append only.
      //FIX ME after mvp.
      function onReady() {        
        console.log('ON READY', state)
        var s = kv.put(STATE)

        function write(k,v) {
          console.log('STATE', k, v)
          s.write([k, v])
        }

        for(var k in state)
          write(k, state[k])
        emitter.on('_change', write)

        emitter.ready = true
        emitter.emit('ready')
      }

      if(stat) {
        //read the file...
        kv.get(STATE)
        .on('data', function (data) {
          var key = data.shift()
          var value = data.shift()
          state[key] = value
        })
        .on('error', function () {
          console.log('ERRO')
        })
        .once('close', onReady)
      } else
        onReady()
    })
  }

  //^^^ replace with merkle tree.
}
