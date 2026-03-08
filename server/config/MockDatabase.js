import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storagePath = path.join(__dirname, "../database/storage");

if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
}

class MockModel {
    constructor(name) {
        this.name = name;
        this.filePath = path.join(storagePath, `${name}.json`);
        this.data = [];
        this.load();
    }

    load() {
        if (fs.existsSync(this.filePath)) {
            try {
                this.data = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
            } catch (e) {
                this.data = [];
            }
        } else {
            this.data = [];
        }
    }

    save() {
        // Strip methods before saving
        // JSON.stringify automatically ignores functions
        fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    }

    _attachMethods(item) {
        if (!item) return null;
        // Check if methods already attached to avoid overwriting or duplicates
        if (item.update && item.destroy) return item;

        item.update = async (updates) => {
            Object.assign(item, updates);
            this.save();
            return item;
        };
        item.destroy = async () => {
            const idx = this.data.indexOf(item);
            if (idx > -1) {
                this.data.splice(idx, 1);
                this.save();
            }
        };
        // Some code uses .save() on instance? Sequelize usually uses .save() to persist changes made to properties.
        item.save = async () => {
            this.save();
            return item;
        };
        return item;
    }

    async findAll(options = {}) {
        const where = options.where || {};
        const results = this.data.filter(item => {
            for (const key in where) {
                // strict equality might satisfy
                if (String(item[key]) !== String(where[key])) return false;
            }
            return true;
        });

        return results.map(item => this._attachMethods(item));
    }

    async findOne(options = {}) {
        const results = await this.findAll(options);
        return results.length > 0 ? results[0] : null;
    }

    async create(data) {
        // Handle ID
        if (!data.id) {
            // Generate a simple numeric or string ID
            data.id = Date.now() + Math.floor(Math.random() * 1000);
        }

        this.data.push(data);
        this.save();
        return this._attachMethods(data);
    }

    async update(data, options = {}) {
        const targets = await this.findAll(options);
        let count = 0;
        for (const item of targets) {
            Object.assign(item, data);
            count++;
        }
        if (count > 0) this.save();
        return [count]; // Sequelize update returns [affectedCount]
    }

    async destroy(options = {}) {
        const where = options.where || {};
        if (options.truncate) {
            this.data = [];
            this.save();
            return 1;
        }

        const initialLength = this.data.length;
        this.data = this.data.filter(item => {
            for (const key in where) {
                if (String(item[key]) === String(where[key])) return false; // Remove matches
            }
            return true;
        });

        const deletedCount = initialLength - this.data.length;
        if (deletedCount > 0) this.save();
        return deletedCount;
    }

    async sync() {
        // console.log(`Mock DB: Synced ${this.name}`);
    }
    hasMany() { }
    belongsTo() { }
    removeAttribute() { }
}

const models = {};

export const sequelize = {
    define: (name, schema, options) => {
        if (!models[name]) {
            models[name] = new MockModel(name);
        }
        return models[name];
    },
    sync: async () => { },
    authenticate: async () => { console.log('Mock DB Authenticated'); },
    query: async () => { }
};

export const connectDatabase = async () => {
    console.log("Mock Database Connected (JSON Files)");
};

export const connection = {
    query: (sql, cb) => {
        // console.log("Mock Query:", sql);
        if (cb) cb(null);
    }
};
