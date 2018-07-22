import * as assert from 'assert';
import { Term, Literal, Sort, Unary, Binary, VariableTerm, Ite, Let, SortWrapper, SeqRanged, SeqSingleton, SeqUpdate, SetSingleton, MultisetSingleton, Distinct, And, Lookup, PredicateLookup, Or, Application, Quantification } from '../../model/Term';


describe('Term', () => {
    describe('.from()', () => {

        const literalIntJSON = { type: 'literal', sort: { id: 'Int' }, value: "3" };
        const literalInt = new Literal(new Sort('Int'), "3");

        it('should parse well-formed literal terms correctly', () => {
            assert.deepStrictEqual(Term.from(literalIntJSON), literalInt)
        });

        const unaryOpJSON = { type: 'unary', op: '!', p: literalIntJSON };
        const unaryOp = new Unary("!", literalInt);

        it('should parse well-formed unary terms correctly', () => {
            assert.deepStrictEqual(Term.from(unaryOpJSON), unaryOp)
        });

        const binaryOpJSON = { type: 'binary', op: '==', lhs: unaryOpJSON, rhs: literalIntJSON };
        const binaryOp = new Binary("==", unaryOp, literalInt);

        it('should parse well-formed binary terms correctly', () => {
            assert.deepStrictEqual(Term.from(binaryOpJSON), binaryOp)
        });

        const variableJSON = { type: 'variable', id: 'someVariable', sort: { id: 'Int' } };
        const variable = new VariableTerm('someVariable', new Sort('Int'));

        it('should parse well-formed variable terms correctly', () => {
            assert.deepStrictEqual(Term.from(variableJSON), variable);
        });

        it('should parse well-formed quantification terms correctly', () => {
            assert.deepStrictEqual(
                Term.from({ type: 'quantification',
                            quantifier: 'QA',
                            vars: [variableJSON],
                            body: binaryOpJSON,
                            name: "some" }),
                new Quantification('QA', [variable], binaryOp, 'some'));
        });

        it('should parse well-formed application terms correctly', () => {
            assert.deepStrictEqual(
                Term.from({ type: 'application', applicable: 'a', args: [unaryOpJSON], sort: { id: 'Int' } }),
                new Application('a', [unaryOp], new Sort('Int')));
        });

        it('should parse well-formed lookup terms correctly', () => {
            assert.deepStrictEqual(
                Term.from({ type: 'lookup', field: 'f', fieldValueFunction: unaryOpJSON, receiver: unaryOpJSON }),
                new Lookup('f', unaryOp, unaryOp));
        });

        it('should parse well-formed predicateLookup terms correctly', () => {
            assert.deepStrictEqual(
                Term.from({ type: 'predicateLookup',
                            predicate: 'p',
                            predicateSnapFunction: unaryOpJSON,
                            args: [unaryOpJSON, unaryOpJSON] }),
                new PredicateLookup('p', unaryOp, [unaryOp, unaryOp]));
        });

        it('should parse well-formed and terms correctly', () => {
            assert.deepStrictEqual(
                Term.from({ type: 'and', terms: [unaryOpJSON, unaryOpJSON]}),
                new And([unaryOp, unaryOp]));
        });

        it('should parse well-formed or terms correctly', () => {
            assert.deepStrictEqual(
                Term.from({ type: 'or', terms: [unaryOpJSON, unaryOpJSON]}),
                new Or([unaryOp, unaryOp]));
        });

        it('should parse well-formed distinct terms correctly', () => {
            assert.deepStrictEqual(
                Term.from({ type: 'distinct', symbols: ['one', 'two', 'three']}),
                new Distinct(['one', 'two', 'three']));
        });

        it('should parse well-formed ite terms correctly', () => {
            assert.deepStrictEqual(
                Term.from({ type: 'ite', cond: unaryOpJSON, thenBranch: binaryOpJSON, elseBranch: binaryOpJSON }),
                new Ite(unaryOp, binaryOp, binaryOp));
        });

        it('should parse well-formed let terms correctly', () => {
            assert.deepStrictEqual(
                Term.from({ type: 'let',
                            bindings: [ { var: variableJSON, value: literalIntJSON },
                                        { var: variableJSON, value: literalIntJSON } ],
                            body: binaryOpJSON }),
                new Let([[variable, literalInt],[variable, literalInt]], binaryOp))
        });

        it('should parse well-formed sortWrapper terms correctly', () => {
            assert.deepStrictEqual(
                Term.from({ type: 'sortWrapper', term: unaryOpJSON, sort: { id: 'Int' } }),
                new SortWrapper(unaryOp, new Sort('Int')));
        });

        const seqSingletonJSON = { type: 'seqSingleton', value: unaryOpJSON };
        const seqSingeton = new SeqSingleton(unaryOp);

        it('should parse well-formed seqSingleton terms correctly', () => {
            assert.deepStrictEqual(
                Term.from(seqSingletonJSON),
                seqSingeton);
        });

        it('should parse well-formed seqRanged terms correctly', () => {
            assert.deepStrictEqual(
                Term.from({ type: 'seqRanged', lhs: unaryOpJSON, rhs: binaryOpJSON }),
                new SeqRanged(unaryOp, binaryOp));
        });

        it('should parse well-formed seqUpdate terms correctly', () => {
            assert.deepStrictEqual(
                Term.from({ type: 'seqUpdate', seq: seqSingletonJSON, index: unaryOpJSON, value: unaryOpJSON }),
                new SeqUpdate(seqSingeton, unaryOp, unaryOp));
        });

        it('should parse well-formed singletonSet terms correctly', () => {
            assert.deepStrictEqual(
                Term.from({ type: 'singletonSet', value: unaryOpJSON }),
                new SetSingleton(unaryOp));
        });

        it('should parse well-formed singletonMultiset terms correctly', () => {
            assert.deepStrictEqual(
                Term.from({ type: 'singletonMultiset', value: unaryOpJSON }),
                new MultisetSingleton(unaryOp));
        });
    });
});