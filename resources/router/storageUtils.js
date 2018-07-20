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
var _name = function(name, override) {
    if (name && override) {
        return name;
    } else if (name) {
        var u = new URL(dname);
        return [u.protocol+'/', u.host, name].join('/');
    } else {
        return dname;
    };
}

var _database = function(name, override) {
    return new Promise(function(resolve, reject) {
        var db = new PouchDB(_name(name, override));
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
var _getModel = function(name, id) {
    return _database(name).then(function(db) {
        return db.get(id);
    }).catch(function(e) {
        return Promise.reject(new PouchException("get failure", e));
    });
};

var _getModels = function(name) {
    return _database(name).then(function(db) {
        return db.allDocs({include_docs: true}).then(function(res){
            return res.rows.map(function(entry){
                return entry.doc;
            });
        });

    }).catch(function(e) {
        return Promise.reject(new PouchException("get all failure", e));
    })
}

// - uses pdb upsert to update dtou statements for concurrency control
// - fakes storage2 functionality --> port back to browser by wrapping storage2 instead of upsert
var _upsert = function(name, id, fun) {
    return _database(name).then(function(db) {
        return db.upsert(id, fun);
    }).catch(function(e) {
        return Promise.reject(new PouchException("upsert failure", e));
    });
};


module.exports = {
    db: _database,
    get: _getModel,
    getAll: _getModels,
    update: _upsert
};
