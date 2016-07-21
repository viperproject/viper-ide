interface Progress {
    current: number;
    total: number;
}

export class TotalProgress {
    predicates: Progress;
    functions: Progress;
    methods: Progress;

    constructor(json: TotalProgress) {
        this.predicates = json.predicates;
        this.methods = json.methods;
        this.functions = json.functions;
    }

    public toPercent(): number {
        let total = this.predicates.total + this.methods.total + this.functions.total;
        let current = this.predicates.current + this.methods.current + this.functions.current;
        return 100 * current / total;
    }
}