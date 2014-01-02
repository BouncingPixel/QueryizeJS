
module.exports = function () {

	var debugEnabled = false;

	var dataBindings = {};

	var attributes = {
		database: false,
		tableName: false,
		tableAlias: false,
		where: [],
		whereBoolean: ' AND ',
		set: [],
		columns: ['*'],
		joins: [],
		orderBy: false,
		groupBy: false,
		distinct: false,
		limit: false,
		builder: false
	};

	// creates a string that is unique to this runtime session
	// (based on lo-dash.uniqueId)
	var idCounter = 0;
	function uniqueId(prefix) {
		var id = ++idCounter + '';
		return prefix ? prefix + id : id;
	}

	var isArray = Array.isArray;

	function isDefined(value) {
		return value !== undefined && value !== null;
	}

	function isValidPrimative(value) {
		return typeof value !== 'string' &&
			typeof value !== 'boolean' &&
			typeof value !== 'number' &&
			!(value instanceof Date);
	}

	function flatten(input, includingObjects) {
		var result = [];

		function descend(level) {
			if (isArray(level)) {
				level.forEach(descend);
			} else if (typeof level === 'object' && includingObjects) {
				Object.keys(level).forEach(function (key) {
					descend(level[key]);
				});
			} else {
				result.push(level);
			}
		}

		descend(input);

		return result;
	}

	function convertNamedParameters (query) {
		var data = [];

		query = query.replace(/({{\w*}})/g, function (match, name) {
			if (dataBindings[name] === undefined) throw new Error('The data binding '+name+' could not be found.');

			data.push(dataBindings[name]);
			
			return '?';
		});

		return {
			query: query,
			data: data
		};
	}

	function insertBinding (key, data) {
		if (typeof data === 'object') {
			// if we've got a date, convert it into a mysql ready datestamp
			if (data instanceof Date) {
				data = data.toISOString().slice(0, 19).replace('T', ' ');
			} else {
				throw new TypeError('Received unparsable object as field value.');
			}
		}

		if (key.substr(0,2) !== '{{') key = '{{' + key + '}}';

		dataBindings[key] = data;

		return this;
	}

	function createBinding (data, modifier) {
		if (data === true) return 'TRUE';
		if (data === false) return 'FALSE';

		if (typeof data === 'object') {
			// if we've got a date, convert it into a mysql ready datestamp
			if (data instanceof Date) {
				data = data.toISOString().slice(0, 19).replace('T', ' ');
			} else {
				throw new TypeError('Received unparsable object as field value.');
			}
		}

		var key = '{{' + uniqueId('binding') + '}}';

		insertBinding(key, data);

		return modifier ? [modifier, '(', key, ')'].join('') : key;
	}

	function where (clause, value, operator, modifier) {

		// if a value is defined, then we're performing a field > value comparison
		// and must parse that first.
		if (isDefined(value)) {
			clause = processWhereCondition(clause, value, operator, modifier);

		// if there was no value, check to see if we got an object based where definition
		} else if (typeof clause === 'object' && !isArray(clause)) {
			clause = processWhereObject(clause, operator, modifier);
		}

		// if we've got an array at this point, then we should parse it as if it were
		// a collection of possible conditions in an OR
		if (isArray(clause)) {
			clause = flatten(clause);
			var l = clause.length;
			if (l === 1) {
				clause = clause[0];
			} else if (l > 1) {
				clause = '(' + clause.join(' OR ') + ')';
			} else {
				clause = null;
			}
		}

		// by now the clause should be a string. if it isn't, then someone gave us an unusable clause
		if (typeof clause === 'string') {
			attributes.where.push(clause);
		} else {
			throw new TypeError('Where clause could not be processed. Found ' + (typeof clause) + ' instead.');
		}

		return this;
	}

	function processWhereCondition (field, value, operator, modifier) {
		if (!operator) operator = '=';

		if (isArray(field)) {
			return field.map(function (field) {
				return processWhereCondition(field, value, operator, modifier);
			});
		}

		// if value is an array, then we need to compare against multiple values
		if (isArray(value)) {
			// if the operator is a plain equals, we should perform an IN() instead of multiple ORs
			if (operator === '=') {

				//process the values into bindings, and join the bindings inside an IN() clause
				return field + ' IN (' + value.map(function (v) { return createBinding(v, modifier); }).join(',') + ')';
			} else if (operator === '!=') {

				//process the values into bindings, and join the bindings inside an IN() clause
				return field + ' NOT IN (' + value.map(function (v) { return createBinding(v, modifier); }).join(',') + ')';

			} else {

				// process each value individually as a single condition and join the values in an OR
				return value.map(function (value) { return processWhereCondition(field, value, operator, modifier); });

			}
		}

		return [field, operator, createBinding(value, modifier)].join(' ');
	}

	function processWhereObject (clause, operator, modifier) {
		if (!operator) operator = '=';

		var not = false;
		clause = Object.keys(clause).map(function (field) {
			// if the object contains a 'not' key, all subsequent keys parsed will be negations.
			if (field === 'not' && clause[field] === true) {
				not = true;
				if (operator === '=') operator = '!=';
				return undefined;
			}

			return processWhereCondition(field, clause[field], operator, modifier);
		}).filter(function (d) { return d;});

		if (clause.length === 1) {
			return clause[0];
		} else if (clause.length > 1) {
			return '(' + clause.join(' AND ') + ')';
		}

		return undefined;
	}

	function whereBetween (field, from, to, modifier) {
		where([field, 'BETWEEN', createBinding(from, modifier), 'AND', createBinding(to, modifier)].join(' '));

		return this;
	}

	function set (clause, value, modifier) {

		if (typeof clause === 'object') {
			Object.keys(clause).forEach(function (field) {
				set(field, clause[field], modifier);
			});
			return this;
		}

		// if we received a value, create a set clause
		if (isDefined(value)) {
			if (isValidPrimative(value)) {
				throw new TypeError('Unknown data type in set clause');
			}
			clause = [clause, '=', createBinding(value, modifier)].join(' ');
		}

		attributes.set.push(clause);

		return this;
	}


	function join (clause, options) {

		if (typeof clause === 'object') {

			if (isArray(clause)) throw new TypeError('Join clauses can only be strings or object definitions');
			if (!clause.table) throw new Error('You must define a table to join against');

		} else if (typeof options === 'object') {

			clause = Object.create(options, {table: clause});

		} else if (typeof clause === 'string' && !clause.search(joinTest)) {

			clause = 'INNER JOIN ' + clause;

		}

		if (typeof clause === 'object') {

			var stack = [];

			stack.push(clause.type || 'INNER');
			stack.push('JOIN');
			stack.push(clause.table);
			if (clause.alias) stack.push(clause.alias);

			if (clause.using) {
				stack.push( 'USING (' + (isArray(clause.using) ? clause.using.join(',') : clause.using) + ')' );

			} else if (clause.on) {
				stack.push( 'ON (' + processJoinOns(clause.on, clause.onBoolean || 'AND') + ')' );

			}

			clause = stack.join(' ');
		}

		attributes.joins.push(clause);

		return this;
	}

	function processJoinOns(ons, onBoolean) {

		if (typeof ons === 'string') {
			return ons;
		}

		if (isArray(ons)) {
			ons = ons.map(processJoinOns);
		}

		if (typeof ons === 'object') {
			var not = false;
			ons = Object.keys(ons).map(function (field) {
				var value = ons[field];

				// if the object contains a 'not' key, all subsequent keys parsed will be negations.
				if (field === 'not' && value === true) {
					not = true;
				}

				// if value is an array, perform an IN() on the values
				if (isArray(value)) {
					return [field, not ? 'NOT IN' : 'IN', '(', value.join(','), ')'].join(' ');

				// if value is an object, verify if it's a data object, and if so create a binding for the value
				} else if (typeof value === 'object' && isDefined(value.data)) {
					return [field, not ? '!=' : '=', createBinding(value.data, value.modifier)].join(' ');

				// if value is a string or a number, process as if a normal pairing of columns
				} else if (typeof value === 'string' || typeof value === 'number') {
					return [field, not ? '!=' : '=', value].join(' ');

				}

				// we don't know how to handle the value
				throw new Error('Encountered unexpected value while parsing a JOIN ON condition');
			});
		}

		//remove any undefined or empty string values
		ons = ons.filter(function (d) { return d; });

		return ons.join(' '+onBoolean+' ');
	}

	var joinTest = /^(.*)?(JOIN) /i;

	var queryize = {

		debug: function (enable) {
			if (isDefined(enable)) enable = true;

			debugEnabled = enable;

			return this;
		},

		createBinding: createBinding,

		insertBinding: insertBinding,

		select: function () {
			attributes.builder = buildSelect;
			return this;
		},

		deleet: function () {
			attributes.builder = buildDelete;
			return this;
		},

		deleteFrom: function (tablename, alias) {
			attributes.builder = buildDelete;

			if (isArray(tablename)) {
				if (alias) {
					this.from(tablename.shift(), alias);
					tablename.unshift(alias);
				}
				this.columns(tablename);
			} else if (tablename) {
				this.from(tablename, alias);
			}

			return this;
		},

		insert: function () {
			attributes.builder = buildInsert;
			return this;
		},

		update: function () {
			attributes.builder = buildUpdate;
			return this;
		},

		table: function (tablename, alias) {
			attributes.tableName = tablename;
			if (isDefined(alias)) {
				attributes.alias = alias;
			}
			return this;
		},

		database: function (database, tablename, alias) {
			attributes.database = database;
			if (tablename) {
				attributes.tableName = tablename;
			}
			if (alias) {
				attributes.alias = alias;
			}
			return this;
		},

		columns: function () {
			var args = flatten([].slice.call(arguments));

			args = args.map(function (column) {
				if (typeof column === 'string') {
					return column;
				}

				if (typeof column === 'number' || column instanceof Date) {
					return createBinding(column);
				}

				if (typeof column === 'object' && isDefined(column.data)) {
					return createBinding(column.data, column.modifier);
				}

				throw new TypeError('Unknown column type');
			});

			attributes.columns = args;

			return this;
		},

		comparisonMethod: function (condition) {
			switch (condition) {
			case true:
			case 'and':
			case 'AND':
			case 'yes':
				attributes.whereBoolean = ' AND '; break;

			case false:
			case 'or':
			case 'OR':
			case 'no':
				attributes.whereBoolean = ' OR '; break;
			}
			return this;
		},

		where: where,

		whereLike: function (field, value, modifier) {
			where(field, value, 'LIKE', modifier);
			return this;
		},

		whereNot: function (field, value, modifier) {
			where(field, value, '!=', modifier);
			return this;
		},

		whereNotLike: function (field, value, modifier) {
			where(field, value, 'NOT LIKE', modifier);
			return this;
		},

		whereInRange: function (field, from, to, modifier) {
			if (isDefined(from) && isDefined(to)) {
				whereBetween(field, from, to, modifier);
			} else if (isDefined(from)) {
				where(field, from, '>=', modifier);
			} else if (isDefined(to)) {
				where(field, to, '<=', modifier);
			}
			return this;
		},

		whereBetween: whereBetween,

		set: set,

		join: join,

		innerJoin: function (clause, options) {

			if (typeof clause === 'object') {

				if (isArray(clause)) throw new TypeError('Join clauses can only be strings or object definitions');
				if (!clause.table) throw new Error('You must define a table to join against');

			} else if (typeof options === 'object') {

				clause = Object.create(options, {table: clause});

			}

			if (typeof clause === 'object') {
				clause.type = 'INNER';
			} else {
				clause = clause.search(joinTest) ? clause.replace(joinTest, 'INNER JOIN') : 'INNER JOIN ' + clause;
			}

			join(clause);

			return this;
		},

		leftJoin: function (clause, options) {

			if (typeof clause === 'object') {

				if (isArray(clause)) throw new TypeError('Join clauses can only be strings or object definitions');
				if (!clause.table) throw new Error('You must define a table to join against');

			} else if (typeof options === 'object') {

				clause = Object.create(options, {table: clause});

			}

			if (typeof clause === 'object') {
				clause.type = 'LEFT';
			} else {
				clause = clause.search(joinTest) ? clause.replace(joinTest, 'LEFT JOIN') : 'LEFT JOIN ' + clause;
			}

			join(clause);

			return this;
		},

		rightJoin: function (clause, options) {

			if (typeof clause === 'object') {

				if (isArray(clause)) throw new TypeError('Join clauses can only be strings or object definitions');
				if (!clause.table) throw new Error('You must define a table to join against');

			} else if (typeof options === 'object') {

				clause = Object.create(options, {table: clause});

			}

			if (typeof clause === 'object') {
				clause.type = 'RIGHT';
			} else {
				clause = clause.search(joinTest) ? clause.replace(joinTest, 'RIGHT JOIN') : 'RIGHT JOIN ' + clause;
			}

			join(clause);

			return this;
		},

		orderBy: function () {
			var args = flatten([].slice.call(arguments));

			attributes.orderBy = args;

			return this;
		},

		groupBy: function () {
			var args = flatten([].slice.call(arguments));

			attributes.orderBy = args;

			return this;
		},

		distinct: function (on) {
			attributes.distinct = isDefined(on) ? true : on;
			return this;
		},

		limit: function (max, offset) {
			if (isDefined(max)) max = 0;
			if (isDefined(offset)) offset = 0;

			attributes.limit = max ? ['LIMIT ',Number(offset), ', ', Number(max)].join() : false;

			return this;
		},

		compile: function () {
			if (!attributes.builder) throw new Error('Query operation undefined, must identify if performing a select/update/insert/delete query.');
			if (!attributes.tableName) throw new Error('No table name has been defined');

			var query = attributes.builder();

			return convertNamedParameters(query);
		}

	};

	queryize.into = queryize.table;
	queryize.intoDatabase = queryize.database;
	queryize.from = queryize.table;
	queryize.fromDatabase = queryize.database;


	function buildTableName () {
		var q = [];
		
		if (attributes.database) {
			q.push('`' + attributes.database + '`.');
		}
		
		q.push('`' + attributes.tableName + '`');
		
		if (attributes.alias) {
			q.push(' ' + attributes.alias);
		}

		return q.join('');
	}

	function buildSelect() {
		var columns = attributes.columns.join(', ');
		if (attributes.distinct) columns = 'DISTINCT ' + columns;

		var q = ['SELECT', columns, 'FROM', buildTableName()];

		q = q.concat(attributes.joins);

		if (attributes.where.length) {
			q.push('WHERE');
			q.push(attributes.where.join(attributes.whereBoolean));
		}

		if (attributes.groupBy.length) {
			q.push('GROUP BY');
			q.push(attributes.groupBy.join(', '));
		}

		if (attributes.orderBy.length) {
			q.push('GROUP BY');
			q.push(attributes.orderBy.join(', '));
		}

		if (attributes.limit) {
			q.push(attributes.limit);
		}

		q = q.join(' ');

		return q;
	}

	function buildUpdate() {
		var q = ['UPDATE', buildTableName()];

		if (!attributes.set.length) {
			throw new Error('No values to insert have been defined');
		}

		q.push('SET');
		q.push(attributes.set.join(', '));

		if (attributes.where.length) {
			q.push('WHERE');
			q.push(attributes.where.join(attributes.whereBoolean));
		}

		q = q.join(' ');

		return q;
	}

	function buildInsert() {
		var q = ['INSERT INTO', buildTableName()];

		if (!attributes.set.length) {
			throw new Error('No values to insert have been defined');
		}

		q.push('SET');
		q.push(attributes.set.join(', '));

		q = q.join(' ');

		return q;
	}

	function buildDelete() {
		var q = ['DELETE'];

		if (attributes.columns.length) {
			var columns = attributes.columns.join(', ');
			if (columns && columns !== '*') q.push(columns);
		}

		q.push('FROM');
		q.push(buildTableName());

		q = q.concat(attributes.joins);

		if (!attributes.where.length) {
			throw new Error('No where clauses have been defined for the delete query.');
		}
		
		q.push('WHERE');
		q.push(attributes.where.join(attributes.whereBoolean));

		q = q.join(' ');

		return q;
	}


	
	return queryize;

};