// - simplified storage shim without backbone or syncing (rely on upsert)
//   can be plugged back into browser by wrapping storage2
const PouchDB   = require('pouchdb'),
    dname       = process.env.PDB_NAME ? process.env.PDB_NAME.replace(/^\/|\/$/g, '') : null;

PouchDB.plugin(require('pouchdb-upsert'));

var PDB_OPTIONS = {};

function PouchException(msg, wrapped, status) {
    var e = Error.call(this, (wrapped) ? (msg, wrapped.message) : msg);
    e.name = "Pouch Exception";
    e.details = wrapped;
    e.status = status ? status : 500;
    return e;
}

var _database = function(name, override) {
    return new Promise(function(resolve, reject) {
        var db = {};
        if (name && override) {
            db = new PouchDB(name);
        } else if (name) {
            db = new PouchDB([dname, name].join('/'));
        } else {
            db = new PouchDB(dname);
        };
        db.info(function(e, res) {
            if(e){
                console.error(e);
                reject(new PouchException("db init failure", e));
            }
            resolve(db);
        });
    });
};

// - fakes a backbone model get
var _getModel = function(id) {
    return _database().then(function(db) {
        return db.get(id);
    }).catch(function(e) {
        return Promise.reject(new PouchException("get failure", e));
    });
};

// - uses pdb upsert to update dtou statements for concurrency control
// - fakes storage2 functionality --> port back to browser by wrapping storage2 instead of upsert
var _upsert = function(id, fun) {
    return _database().then(function(db) {
        return db.upsert(id, fun);
    }).catch(function(e) {
        return Promise.reject(new PouchException("upsert failure", e));
    });
};

// _getModel('tweet-997114751212666880').then(function(out) {
//     console.log(out);
//     console.log('updating');
//     var go = function (m) {
//
//     };
//     return _upsert('tweet-997114751212666880', );
// }).catch(function(e) {
//     console.log(e.stack);
// });

module.exports = {
    get: _getModel,
    update: _upsert
};
