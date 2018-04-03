import * as ts from 'typescript';
import {Param, ParamsMap} from './params';
import {validate} from './utils';

export default class InterfaceBuilder {
    private _compiledRules: CompiledRule[];
    private _config: Config;

    constructor(config: Config, compiledRules: CompiledRule[]) {
        this._config = config;
        this._compiledRules = compiledRules;
    }

    toString(paramsMap: ParamsMap): string {
        let paramStrings = new Map<number, string[]>();
        
        for (let k in paramsMap) {
            let p: Param = paramsMap[k];
            let bestRule : CompiledRule | null = null;
            let bestMatch: number = 0;
            let rank: number = -1;

            for (let i = 0; i < this._compiledRules.length; i++) {
                let cr: CompiledRule = this._compiledRules[i];
                let n = cr.matchParam(p);
                if (n > bestMatch) {
                    bestMatch = n;
                    bestRule = cr;
                    rank = i;
                }
            }

            if (bestRule !== null) {
                let otherParams: string[] | undefined = paramStrings.get(rank);
                let params = otherParams === undefined ? [] : otherParams;
                params.push(bestRule.apply(p).trim());
                paramStrings.set(rank, params);
            }
        }

        let keys = Array.from(paramStrings.keys());
        keys.sort();
        let params = keys.map((k) => { return (paramStrings.get(k) as string[]).join(' '); }).join(' ');

        return this._config.Template.replace('@@PARAMS@@', params);
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

    static getDefaultConfig(): Config {
        return new Config();
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
    Template: string;
    Rules: Rule[];

    constructor(template: string = '', rules: Rule[] = []) {
        this.Template = template;
        this.Rules = rules;
    }

    private static defaultConfig: Config = new Config();

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
        let name = CompiledRule.getMatchOrContent(this._nameRe, p.name);
        let type = CompiledRule.getMatchOrContent(this._typeRe, p.type);
        let rule = this.compileRule();
        return rule.Run(name, type, p.value);
    }

    private static getMatchOrContent(re: RegExp | null, content: string): RegExpMatchArray {
        let match = CompiledRule.getMatch(re, content);
        if (match === null || match.length === 0) {
            return [content];
        }
        return match;
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
