# rumours-db

<img src=https://secure.travis-ci.org/'Dominic Tarr'/rumours-db.png?branch=master>

### this is stream-of-conciousness notes. not documentation yet, sorry.

So, right now, I'm just replicating each live document.
When you connect, it's necessary to sync all documents.

use a Merkle Tree.

do this is parallel with the open documents 
(because that is much more important, we want that to work live)
only do disk IO when something changes.
that is a little bit more complicated than just reading 
and writing.

Also, you may want to compact. 
maybe we want some smart compacting on the client, 
to optimize for localStorage.

next: TESTS?, persistence, efficient-replication?
this is basically integration, so don't go overboard with tests.
test the modules. just integration testing lite.
okay, so next is persistence.

-- okay, so that is basically working.

---------------------------------------------------------

Real Time Replication (RTR)
---------------------------

OKAY, if a document opens on node node, and he's connected to other nodes,
it should open remotely, with RTR.
but if the they close, then the remote can close too.
okay, so you need a count of the open connections,
and if the user calls trx(name) that is +1

A--b--c

A started the trx,
b, c, replicate
when A closes, b, c need to know to close.
oh, I know, if you did not open a trx, 
just close it if you havn't seen any changes recently.

----------------------------------------------------------

that means that rumors needs to reopen streams for live models that have ended.

No! SIMPLER

A--b(server)...c

do not TRX to c unless c opens the TRX too.

A--b(server)--C

then the server only needs to keep a count of connections!

----------------------------------------------------------

hmm, actuall, now that I think about it more, these are both viable options.

Or, a combination. So, close quiet TRXs but don't close them back to the end client.

maybe the point here is I want to abstract the actual streaming of scuttlebutts?

it's not something the user needs to think about, 
so why would the dev want to think about it?

----------------------------------------------------------

## Merkle Tree

okay, so the first thing here is to know the current image of the total data.
so when an object comes into and out of memory, you need to remember it's state...

then a summary (hash) of that state needs to be remembered...
(so, a file of {key: hash} pairs?)
then, when you connect, you start by exchanging each other's states,
and then you replicate any document that is different.

This doesn't need to be symmetrical, either side sends thier current hashes,
the other responds by starting replications

so, the first thing: a hash representing the current snapshot of a datastructure...

We need to know that a doc has changed..., so, basically, we write an append only log.
when, on startup, read this log, and then send that data...

AHA! the cheapest thing would be a hash of the vector clock!

## License

MIT
