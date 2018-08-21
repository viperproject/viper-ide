import { SymbExLog } from "../external";
import { Term, Application } from "./Term";
import { Verifiable } from "./Verifiable";


export class Program {

    constructor(readonly verifiables: Verifiable[],
                readonly axioms: Term[],
                readonly functionPostAxioms: Term[],
                readonly macros: Map<Application, Term>) {}

    public static from(log: SymbExLog): Program {
        const verifiables = log.members.map(Verifiable.from);
        const axioms = log.axioms.map(Term.from);
        const functionPostAxioms = log.functionPostAxioms.map(Term.from);
        const macros = new Map<Application, Term>();
        log.macros.forEach(m => {
            const app = <Application> Term.from(m.macro);
            const body = Term.from(m.body);
            macros.set(app, body);
        });

        return new Program(verifiables, axioms, functionPostAxioms, macros);
    }
}