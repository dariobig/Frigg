import {Uri, TextDocument, workspace, window} from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export default class Params {
    original: Uri;
    lastParamFile: string | null = null;
    private paramsMap: ParamsMap;

    constructor(doc: TextDocument) {
        this.original = doc.uri;
        this.paramsMap = this.findParams(doc.getText());
    }

    public getParams(): ParamsMap {
        return this.paramsMap; 
    }

    public tryUpdateParams(filePath: string): boolean {
        let onDisk = Params.loadParameters(filePath);
        if (!onDisk) {
            return false;
        }

        this.lastParamFile = filePath;
        this.paramsMap = mergeParams(this.paramsMap, onDisk, this.getDeleteMissingParams());
        return true;
    }

    public saveParams(outputPath: string): Thenable<Uri> {
        return new Promise((resolve, reject) => {
            let json = JSON.stringify(this.paramsMap, null, 2);
            return fs.writeFile(outputPath, json, {encoding: 'utf8'}, (err) => {
                if (err !== undefined && err !== null) {
                    window.showErrorMessage(`couldn't save parameters to "${outputPath}":\n${err}`);
                    return reject(err);
                }

                this.lastParamFile = outputPath;
                return resolve(Uri.file(outputPath));
            });
        });
    }

    public defaultParametersPath(): string {
        return this.original.fsPath + '.json';
    }

    public discoverParamatersFiles(): Thenable<string[]> {
        let filePath = path.parse(this.defaultParametersPath());
        return new Promise((resolve, reject) => {
            return fs.readdir(filePath.dir, (err, files) => {
                if (err !== undefined && err !== null) {
                    return reject(err);
                }

                return resolve(files
                    .filter(f => f !== filePath.name && f.startsWith(filePath.name))
                    .map(f => path.join(filePath.dir, f)));
            });
        });
    }

    static loadParameters(paramsFile: string): ParamsMap | null {
        if (!fs.existsSync(paramsFile)) {
            return null;
        }
    
        let paramsMap = Params.parseParameters(fs.readFileSync(paramsFile, 'utf8'));
        if (paramsMap === null) {
            window.showErrorMessage(`corrupted param file: ${paramsFile}`);
        }
        return paramsMap;
    }

    static parseParameters(content: string): ParamsMap | null {
        try {
            let paramsMap = <ParamsMap>JSON.parse(content);
            return paramsMap;
        } catch (e) {
            return null;
        }
    }



    private getPattern(): RegExp {
        var fromSettings: string | undefined = workspace.getConfiguration('frigg', null).get('parameterPattern');
        if (fromSettings !== undefined) {
            try {
                return new RegExp(fromSettings, 'g');
            } catch (e) {
                window.showErrorMessage(`${typeof e} using frigg.parameterPattern ${fromSettings}`);
            }
        }

        var pattern = '@@([^@\\s+])@@';
        window.showErrorMessage(`can't find frigg.parameterPattern, using default pattern: ${pattern}`);
        return new RegExp(pattern, 'g');
    }

    private getDeleteMissingParams(): boolean {
        var fromSettings: boolean | undefined = workspace.getConfiguration('frigg', null).get('deleteMissingParams');
        return fromSettings !== undefined ? fromSettings : true;
    }

    private findParams(content: string): ParamsMap {
        var re = this.getPattern();
        var params: ParamsMap = { };
        var match;
        while (match = re.exec(content)) {
            params[match[0]] = new Param(match.length > 1 ? match[1] : match[0]);
        }

        return params;
    }
}

export class Param {
    public name: string;
    public value: string;
    public type: string;
    
    constructor(name: string, value: string = "", type: string = "") {
        this.name = name;
        this.value = value;
        this.type = type;
    }

    public static getValue(p: Param): string {
        return p.type.toLowerCase() === "string" ? JSON.stringify(p.value) : p.value;
    }

    public static wrap(obj: any|null|undefined): Param {
        if (obj === null || obj === undefined || typeof(obj) !== 'object') {
            return new Param('');
        }

        var p = obj as Param;
        p.name = 'name' in p ? `${p.name}` : '';
        p.value = 'value' in p ? `${p.value}` : '';
        p.type = 'type' in p ? `${p.type}` : '';
        return p;
    }

    public static isEmpty(p: Param): boolean {
        return p.name === '' && p.value === '' && p.type === '';
    }

    public static merge(first: Param, second: Param): Param {
        let merged: any = first;
        let other: any = second;
        for (let k in other) {
            if (other[k] !== '' || !(k in merged)) {
                merged[k] = other[k];
            }
        }

        return merged as Param;
    }
}

export interface ParamsMap {
    [email: string]: Param;
}

function mergeParams(original: ParamsMap, other: ParamsMap, deleteMissing: boolean = true): ParamsMap {
    let merged: ParamsMap = {};
    for (let key in original) {
        merged[key] = Param.merge(original[key], Param.wrap(other[key]));
    }

    if (!deleteMissing) {
        for (let key in other) {
            if (!merged[key]) {
                merged[key] = other[key];
            }
        }    
    }

    return merged;
}
