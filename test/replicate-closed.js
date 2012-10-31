var rumours = require('..')
var Emitter = require('scuttlebutt/events')
var Model = require('scuttlebutt/model')
var rmrf = require ('rimraf')
var mac = require('macgyver')()
var assert = require('assert')
var rmrf = require ('rimraf')
var mac = require('macgyver')()

process.on('exit', mac.validate)

rmrf('/tmp/rumors-test', function () {
  var kv = require('kv')('/tmp/rumors-test')

  function createRumours () {    
    return rumours({
      'events':function (key) {
        return new Emitter()
      },
      'model': function (key) {
        return new Model()
      }
    })
  }

  var r = createRumours()
  r.persist(kv)

  var i = 0
  var hi = r.open('events-hello')
  var timer = setInterval(function () {
    hi.emit('message', 'HELLO ' + new Date())
    if(++i < 5) return
    clearInterval(timer)
    hi.dispose()
  }, 5)

  hi.on('message', function (m) {
    console.log('>>', m)
  }) 

  var hi = r.open('events-hello')
  hi.on('dispose', mac(function () {
    console.log('********************')
    var s = createRumours()

    var rs = r.createStream()
    rs.pipe(s.createStream()).pipe(rs)
    
    s.on('open', function (doc) {
      assert.equal(doc.key, 'events-hello')
      doc.on('message', function (m) {
        console.log('REMOTE: MESSAGE', m)
      })
      doc.on('dispose', function () {
        console.log(hi.history(), doc.history())
        assert.deepEqual(hi.history(), doc.history())
      })
    })

    r.on('open', function (doc) {
      assert.equal(doc.key, 'events-hello')
      doc.on('message', function (m) {
        console.log('LOCAL: MESSAGE', m)
      })
      doc.on('dispose', function () {
        console.log( doc.history())
        assert.deepEqual(hi.history(), doc.history())
      })
      
    })

  }).once())

})
