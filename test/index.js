
var rumours = require('..')
var Emitter = require('scuttlebutt/events')
var Model = require('scuttlebutt/model')

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
var s = rdb()

var chat = r.trx('events/hello')
chat.emit('message', 'HELLO')

var chat2 = s.trx('events/hello')

chat2.on('message', function (m) {
  console.log('MESSAGE', m)
})

var rs = r.createStream()
rs.pipe(s.createStream()).pipe(rs)

