var rumours = require('..')
var Emitter = require('scuttlebutt/events')
var Model = require('scuttlebutt/model')
var rmrf = require ('rimraf')
var mac = require('macgyver')()

process.on('exit', mac.validate)

rmrf('/tmp/rumors-test', function () {
  function createRumours () {
    var kv = require('kv')('/tmp/rumors-test')

    function rdb () {
      return rumours({
        'events':function (key) {
          return new Emitter()
        },
        'model': function (key) {
          return new Model()
        }
      })
    }

    var r = rdb()
    r.persist(kv)

    var i = 0
    var hi = r.trx('events/hello')
    var timer = setInterval(function () {
      hi.emit('message', 'HELLO ' + new Date())
      if(++i < 5) return
      clearInterval(timer)
      hi.dispose()
    }, 50)
    hi.on('message', function (m) {
      console.log('>>', m)
    })    
    return r
  }

  var r = createRumours()

  var hi = r.open('events/hello')
  hi.on('dispose', mac(function () {
    var r = createRumours()
    r.open('events/hello').on('message', mac(function (hi) {
      console.log('message', hi)
    }).times(10))
  }).once())
})
