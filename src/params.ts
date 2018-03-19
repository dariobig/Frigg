import {Uri, TextDocument, workspace, window} from 'vscode';
import * as fs from 'fs';

export default class Params {
    private original: Uri;
    private paramsMap: ParamsMap;

    constructor(doc: TextDocument) {
        this.original = doc.uri;
        this.paramsMap = this.findParams(doc.getText());
    }

    public getParams(): ParamsMap { 
        return this.paramsMap; 
    }

    public tryUpdateParams(): boolean {
        let onDisk = this.loadParameters();
        if (!onDisk) {
            return false;
        }

        this.paramsMap = mergeParams(this.paramsMap, onDisk, this.getDeleteMissingParams());
        return true;
    }

    public saveParams(outputPath: string = ''): Uri {
        var filePath = outputPath === '' ? this.parametersPath() : outputPath;
        fs.writeFileSync(filePath, JSON.stringify(this.paramsMap, null, 2), 'utf8');
        return Uri.file(filePath);
    }

    public parametersPath(): string {
        return this.original.fsPath + '.json';
    }

    private loadParameters(): ParamsMap | null {
        let paramsFile = this.parametersPath();
        if (!fs.existsSync(paramsFile)) {
            return null;
        }
    
        return <ParamsMap>JSON.parse(fs.readFileSync(paramsFile, 'utf8'));
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

        var pattern = '@@[^@\\s+]@@';
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
            params[match[0]] = new Param(match[1], "", "");
        }
        return params;
    }
}

export class Param {
    public name: string = "";
    public value: string = "";
    public type: string = "";
    
    constructor(name: string, value: string, type: string) {
        this.name = name;
        this.value = value;
        this.type = type;
    }

    public static getValue(p: Param): string {
        if (p.type.toLowerCase() === "string") {
            return `"${p.value}"`;
        }
        return p.value;
    }
}

export interface ParamsMap {
    [email: string]: Param;
}

function mergeParams(original: ParamsMap, other: ParamsMap, deleteMissing: boolean = true): ParamsMap {
    var merged: ParamsMap = {};
    for (let key in original) {
        let v = other[key];
        merged[key] = v ? v : original[key];
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
