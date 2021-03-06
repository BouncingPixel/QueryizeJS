#queryize.js

A no-frills chainable/fluent interface for constructing mutable MySQL queries with data binding/escapement.

#Installation

NPM: `npm install queryize`

##Usage

In Node or another CommonJS environment:

```js
var queryize = require('queryize');
var query = queryize().select();
```

```js
var select = require('queryize').select;
var query = select();
```

*More documentation forthcoming, until then, have some examples*

```js
var select = require('queryize').select;
var q = select()
    .from('users', 'u')
    .innerJoin('passwords', {alias: 'p', on: {'u.id':'p.user_id'}})
    .where({'u.email': 'user@example.com'})
    .columns('u.id', 'p.hash')
    .compile();

//q.query contains SELECT u.id, p.hash FROM users u INNER JOIN passwords p ON (u.id = p.user_id) WHERE u.email = ?
//q.data contains  ['user@example.com']
```

```js
var queryize = require('queryize');
var q = queryize()
    .insert().into('users')
    .set({name: 'John Doe', email: 'user@example.com'})
    .compile();

//q.query contains INSERT INTO users SET u.name = ?, u.email = ?
//q.data contains  ['John Doe', 'user@example.com']
```

```js
var queryize = require('queryize');
var q = queryize()
    .update().table('users')
    .set({name: 'John Doe', email: 'user@example.com'})
    .where({'u.id':1})
    .compile();

//q.query contains UPDATE users SET u.name = ?, u.email = ? WHERE u.id = ?
//q.data contains  ['John Doe', 'user@example.com', 1]
```

```js
var queryize = require('queryize');
var q = queryize()
    .deleteFrom('users')
    .where({'u.id':1})
    .compile();

//q.query contains DELETE FROM users WHERE u.id = ?
//q.data contains  ['John Doe', 'user@example.com', 1]
```

##Running Unit Tests

From inside the repository root, run `npm install` to install the NodeUnit dependency.

Run `npm test` to execute the complete test suite.