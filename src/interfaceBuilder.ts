import * as ts from 'typescript';
import {Param, ParamsMap} from './params';
import {validate} from './utils';

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
    private _compiledRules: CompiledRule[];
    private _config: Config;

    constructor(config: Config, compiledRules: CompiledRule[]) {
        this._config = config;
        this._compiledRules = compiledRules;
    }

    toString(paramsMap: ParamsMap): string {
        let paramStrings: string[] = [];
        
        for (let k in paramsMap) {
            let p: Param = paramsMap[k];
            let bestRule : CompiledRule | null = null;
            let bestMatch: number = 0;

            for (let i = 0; i < this._compiledRules.length; i++) {
                let cr: CompiledRule = this._compiledRules[i];
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

    static fromJsonConfig(json: string): InterfaceBuilder | null {
        if (json === null) {
            return null;
        }

        let config = Config.validate(JSON.parse(json));
        if (config === null) {
            return null;
        }

        let compiledRules: CompiledRule[] = [];
        for (let i = 0; i < config.Rules.length; i++) {
            compiledRules.push(new CompiledRule(config.Rules[i]));
        }

        return new InterfaceBuilder(config, compiledRules);
    }

    static build(jsonConfig: string, paramsMap: ParamsMap): string|null {
        let b = InterfaceBuilder.fromJsonConfig(jsonConfig);
        return b === null ? null : b.toString(paramsMap);
    }
}

class Rule {
    typePattern: string = "";
    namePattern: string = "";
    format: string = "";

    constructor(typePattern: string = '', namePattern: string = '', format: string = '') {
        this.typePattern = typePattern;
        this.namePattern = namePattern;
        this.format = format;
    }

    private static defaultRule: any = new Rule();

    public static validate(obj: any): Rule | null {
        return validate<Rule>(obj, Rule.defaultRule);
    }
}

class Config {
    Template: string = "";
    Rules: Rule[] = [];

    private static defaultConfig: Config = {Template: '', Rules: []};

    static validate(obj: any): Config | null {
        let config: Config | null = validate(obj, Config.defaultConfig);
        if (config === null) {
            return null;
        }

        for (let i = 0; i < config.Rules.length; i++) {
            let rule = Rule.validate(config.Rules[i]);
            if (rule === null) {
                return null;
            }
        }

        return config as Config;
    }
}

class CompiledRule extends Rule {
    private _typeRe: RegExp | null;
    private _nameRe: RegExp | null;

    constructor(rule: Rule) {
        super();
        this.format = rule.format;
        this.namePattern = rule.namePattern;
        this.typePattern = rule.typePattern;
        this._typeRe = this.typePattern !== "" ? new RegExp(this.typePattern) : null;
        this._nameRe = this.namePattern !== "" ? new RegExp(this.namePattern) : null;
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
        let replaced = CompiledRule.wrapper.replace('@@RULE@@', this.format);
        let tt = ts.transpile(replaced);
        return eval(tt);
    }

    private static wrapper: string = `({
        Run: (name: RegExpMatchArray, type: RegExpMatchArray, value: string): string => {
            return \`@@RULE@@\`;
        }
    })`;
}
