var rumours = require('..')
var Emitter = require('scuttlebutt/events')
var Model = require('scuttlebutt/model')
var es = require('event-stream')
var macgyver = require('macgyver')
var assert = require('assert')

var mac = macgyver()
process.on('exit', mac.validate)
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

var chat = r.open('events/hello')

chat.on('dispose', mac().never())
chat.on('message', mac().times(5))

s.on('open', mac('open').twice())
var m = s.open('model/state')
var rand = Math.random()
m.set('okay', rand)

var i = 0
var timer = setInterval(function () {
  chat.emit('message', 'HELLO ' + new Date())
  if(++i >= 5)
    clearInterval(timer)
}, 200)


r.on('open', mac(function (doc) {
  doc.on('update', mac(function () {
    assert.equal(this.get('okay'), rand)
  }).once())
}).once())

//will only trigger once, 
//becaue it's now too late to hear about m

s.on('open', mac(function (chat2) {
  console.log('CHAT', chat2.key)
  //if(chat2.key !== 'events/chat') return
  chat2.on('dispose', mac().once())
  chat2.on('message', mac().times(5))
  chat2.on('message', function (hi) {
    console.log('chat2 MESSAGE', hi)
  })
}).once()) 

var rs = r.createStream(), ss
rs.pipe(ss= s.createStream()).pipe(rs)

