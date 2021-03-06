
var queryize = require('../queryize');

exports['basic select'] = function (test) {
	var q = queryize().select().from('users', 'u');
		
	test.deepEqual(q.compile(), {
		query: 'SELECT * FROM `users` u',
		data: []
	});

	test.done();
};

exports['basic select with database'] = function (test) {
	var q = queryize().select().fromDatabase('test', 'users', 'u');
		
	test.deepEqual(q.compile(), {
		query: 'SELECT * FROM `test`.`users` u',
		data: []
	});

	test.done();
};

exports['basic select with multiple columns'] = function (test) {
	var q = queryize().select().from('users');

	q.columns('columnA', ['columnB', 'columnC']);
		
	test.deepEqual(q.compile(), {
		query: 'SELECT columnA, columnB, columnC FROM `users`',
		data: []
	});

	test.done();
};

exports['basic select with value in columns'] = function (test) {
	var q = queryize().select().from('users');

	q.columns('columnA', 3, 'columnC');
		
	test.deepEqual(q.compile(), {
		query: 'SELECT columnA, ?, columnC FROM `users`',
		data: [3]
	});

	test.done();
};

exports['basic select with value object in columns'] = function (test) {
	var q = queryize().select().from('users');

	q.columns('columnA', {data:'foo'}, 'columnC');
		
	test.deepEqual(q.compile(), {
		query: 'SELECT columnA, ?, columnC FROM `users`',
		data: ['foo']
	});

	test.done();
};

exports['basic select with modified date value object in columns'] = function (test) {
	var q = queryize().select().from('users');

	q.columns('columnA', {data:new Date('2014-01-01'), modifier: 'DATE'}, 'columnC');
		
	test.deepEqual(q.compile(), {
		query: 'SELECT columnA, DATE(?), columnC FROM `users`',
		data: ['2014-01-01 00:00:00']
	});

	test.done();
};

exports['select with string where clause'] = function (test) {
	var q = queryize().select().from('users');

	q.where('id = 1');
		
	test.deepEqual(q.compile(), {
		query: 'SELECT * FROM `users` WHERE id = 1',
		data: []
	});

	test.done();
};

exports['select with two argument where clause'] = function (test) {
	var q = queryize().select().from('users');

	q.where('id', 1);
		
	test.deepEqual(q.compile(), {
		query: 'SELECT * FROM `users` WHERE id = ?',
		data: [1]
	});

	test.done();
};


exports['select with object where clause'] = function (test) {
	var q = queryize().select().from('users');

	q.where({id:1});
		
	test.deepEqual(q.compile(), {
		query: 'SELECT * FROM `users` WHERE id = ?',
		data: [1]
	});

	test.done();
};
