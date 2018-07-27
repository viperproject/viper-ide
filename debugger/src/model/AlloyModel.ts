
// TODO: Fix this
type Multiplicity = 'lone' | 'some' | 'one' | 'abstract' | '';

export class AlloyModelBuilder {

    private parts: string[];

    constructor() {
        this.parts = [];
    }

    public comment(text: string) {
        this.parts.push("// " + text);
    }

    public blank() {
        this.parts.push("");
    }

    public sig(
        multiplicity: Multiplicity,
        name: string,
        vars: string[] = [],
        constraints: string[] = []
    ) {
        let sig: string[] = [];

        if (multiplicity !== '') {
            sig.push(multiplicity + " ");
        }
        sig.push(`sig ${name} {`);

        if (vars.length > 0) {
            sig.push("\n");
            sig.push((vars.map(v => "  " + v).join(",\n")));
            sig.push("\n");
        }
        if (constraints.length > 0) {
            sig.push("} {");

            if (constraints.length > 0) {
                sig.push("\n");
                sig.push((constraints.map(v => "  " + v).join(" &&\n")));
                sig.push("\n");
            }
        }
        sig.push("}");

        this.parts.push(sig.join(""));
    }

    public fact(fact: string) {
        this.parts.push(`fact { ${fact} }`);
    }

    private pred(name: string, args: string[], body: string[]) {
        this.parts.push(`pred ${name}(${args.join(", ")}) {${body.join("\n")}}`);
    }

    public build(): string {
        // TODO: Fix this
        this.pred("generate", [], []);
        this.parts.push("run generate for 5 but 3 int");
        
        return this.parts.join("\n");
    }
}