import * as fs from 'fs';
import * as path from 'path';

export function parseJsonSync<T>(json: string|null): T | null {
    if (json === null) {
        return null;
    }

    try {
        return JSON.parse(json) as T;
    } catch (e) {
        return null;
    }
}

export function parseJson<T>(json: string|null): Thenable<T|null> {
    return new Promise((resolve, reject) => {
        if (json === null) {
            resolve(null);
        } else {
            try {
                resolve(JSON.parse(json) as T);
            } catch (e) {
                reject(e);
            }
        }
    });
}

export function validate<T>(obj: any, defaultObj: any): T | null {
    if (obj === null || obj === undefined || typeof obj !== typeof defaultObj) {
        return null;
    }

    for (let k in defaultObj) {
        let val = getProperty(obj, k);
        if (val === undefined || typeof val !== typeof defaultObj[k]) {
            return null;
        }

        // make sure to match the property name.
        obj[k] = val;
    }
    
    return obj as T;
}

export function wrap<T>(obj: any, defaultObj: any): T | null {
    if (obj === null || obj === undefined || typeof obj !== typeof defaultObj) {
        return null;
    }

    for (let k in defaultObj) {
        let val = getProperty(obj, k);
        if (val === undefined || typeof val !== typeof defaultObj[k]) {
            // Forces interface
            obj[k] = defaultObj[k];
        }
        obj[k] = val;
    }
    
    return obj as T;
}

function getProperty(obj: any, property: string): any | undefined {
    if (property in obj) {
        return obj[property];
    }
    
    let lower = property.toLowerCase();
    for (let k in obj) {
        let lower_k = k.toLowerCase();
        if (lower_k === lower) {
            return obj[k];
        }
    }
    return undefined;
}

export function folderExists(folderPath: string) : Thenable<boolean> {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(folderPath)) {
            return resolve(false);
        }

        resolve(fs.lstatSync(folderPath).isDirectory());
    });
}

export function mkFileDirRecursive(filePath: string): boolean {
    try {
        filePath.split(path.sep)
        .reduce((currentPath, folder) => {
            currentPath += folder + path.sep;
            if (!fs.existsSync(currentPath)){
                fs.mkdirSync(currentPath);
            }
            return currentPath;
        }, '');
        return true;
    } catch (e) {
        return false;
    }
}
