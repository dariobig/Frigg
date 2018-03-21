import * as ts from 'typescript';
import {Param} from './params';

// let configStr: string = `{
//     "Template": "UsqlScript ScriptName=(ScriptName:default,Idf.usql) AnalyticsAccountName=matrixadlaprod @@PARAMS@@",
//     "Rules": [
//         {"TypePattern": "string", "NamePattern": "(Input)([^@]*)", "Format": "PATHIN_\${name[2]}={in:EncryptedAzureBlobPath:\${name[2]}}"},
//         {"TypePattern": "string", "NamePattern": "(Output)([^@]*)", "Format": "OutputReferenceEncrypted_\${name[2]}={out:AzureBlobPath:\${name[2]}}"},
//         {"TypePattern": "int", "NamePattern": "(.*)", "Format": "PARAM_\${name[1]}=[(\${name[1]}:int,,\${value !== '' ? ':default,' + value : ''})]"},
//         {"TypePattern": "", "NamePattern": "(.*)", "Format": "PARAM_\${name[1]}=\\"[(\${name[1]})]\\""}
//     ]
// }`;

// let parameters: Param[] = [ new Param("Input1", "", "string"), new Param("Input2", "", "string"), new Param("OutputData", "", "string"), new Param("NumberOfTokens", "13", "int")];
// console.log(InterfaceBuilder.build(configStr, parameters));

export default class InterfaceBuilder {
    private _compiledRules: CompiledRule[] = [];
    private _config: Config = {} as Config;

    constructor(json: string|null) {
        if (json === null) {
            return;
        }

        this._config = JSON.parse(json) as Config;
        this._compiledRules = [];
        for (let i = 0; i < this._config.Rules.length; i++) {
            let r = this._config.Rules[i];
            this._compiledRules.push(new CompiledRule(r));
        }
    }

    toString(params: Param[]): string {
        let paramStrings: string[] = [];
        for (let i = 0; i < params.length; i++) {
            let p: Param = params[i];
            let bestRule : CompiledRule | null = null;
            let bestMatch: number = 0;

            for (let j = 0; j < this._compiledRules.length; j++) {
                let cr: CompiledRule = this._compiledRules[j];
                let n = cr.matchParam(p);
                if (n > bestMatch) {
                    bestMatch = n;
                    bestRule = cr;
                }
            }

            if (bestRule !== null) {
                paramStrings.push(bestRule.apply(p).trim());
            }
        }
        return this._config.Template.replace('@@PARAMS@@', paramStrings.join(' '));
    }

    static build(jsonConfig: string, params: Param[]): string {
        let b = new InterfaceBuilder(jsonConfig);
        return b.toString(params);
    }
}

class Rule {
    TypePattern: string = "";
    NamePattern: string = "";
    Format: string = "";
}

class Config {
    Template: string = "";
    Rules: Rule[] = [];
}

class CompiledRule extends Rule {
    private _typeRe: RegExp | null;
    private _nameRe: RegExp | null;

    constructor(rule: Rule) {
        super();
        this.Format = rule.Format;
        this.NamePattern = rule.NamePattern;
        this.TypePattern = rule.TypePattern;
        this._typeRe = this.TypePattern !== "" ? new RegExp(this.TypePattern) : null;
        this._nameRe = this.NamePattern !== "" ? new RegExp(this.NamePattern) : null;
    }

    matchParam(p: Param): number {
        let name = CompiledRule.matchCount(this._nameRe, p.name);
        let type = CompiledRule.matchCount(this._typeRe, p.type);
        return type === null || name === null ? -1 : name + type;
    }

    apply(p: Param): string {
        let name = CompiledRule.getMatch(this._nameRe, p.name);
        let type = CompiledRule.getMatch(this._typeRe, p.type);
        let rule = this.compileRule();
        return rule.Run(name, type, p.value);
    }

    private static getMatch(re: RegExp | null, content: string): RegExpMatchArray|null {
        if (re === null) {
            return [];
        }

        return re.exec(content);
    }

    private static matchCount(re: RegExp | null, content: string): number|null {
        let m = CompiledRule.getMatch(re, content);
        return m !== null ? m.length : null;
    }

    private compileRule(): any {
        let replaced = CompiledRule.wrapper.replace('@@RULE@@', this.Format);
        let tt = ts.transpile(replaced);
        return eval(tt);
    }

    private static wrapper: string = `({
        Run: (name: RegExpMatchArray, type: RegExpMatchArray, value: string): string => {
            return \`@@RULE@@\`;
        }
    })`;
}
