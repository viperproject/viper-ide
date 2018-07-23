import * as assert from 'assert';
import { Literal, Sort, Unary, VariableTerm } from "../../model/Term";
import { PredicateChunk, HeapChunk, FieldChunk, MagicWandChunk, QuantifiedFieldChunk, QuantifiedPredicateChunk, QuantifiedMagicWandChunk } from '../../model/Heap';

describe('Heap', () => {
    describe('.from()', () => {

        const termJSON = { type: 'literal', sort: { id: 'Int' }, value: "3" };
        const term = new Literal(new Sort('Int'), "3");

        it('should parse well-formed basic_predicate_chunk correctly', () => {
            assert.deepStrictEqual(
                HeapChunk.from({ type: 'basic_predicate_chunk',
                                     predicate: 'predicateName',
                                     args: [termJSON],
                                     snap: termJSON,
                                     perm: termJSON }),
                new PredicateChunk('predicateName', [term], term, term));
        });

        it('should parse well-formed basic_field_chunk correctly', () => {
            assert.deepStrictEqual(
                HeapChunk.from({ type: 'basic_field_chunk',
                                 field: 'fieldName',
                                 receiver: termJSON,
                                 snap: termJSON,
                                 perm: termJSON }),
                new FieldChunk('fieldName', new Sort('Int'), term, term, term));
        });

        it('should parse well-formed basic_magic_wand_chunk correctly', () => {
            assert.deepStrictEqual(
                HeapChunk.from({ type: 'basic_magic_wand_chunk',
                                 args: [termJSON],
                                 snap: termJSON,
                                 perm: termJSON }),
                new MagicWandChunk([term], term, term));
        });

        const fvfJSON = { type: 'variable', id: 'v', sort: { id: 'FVF', elementsSort: { id: 'Int' } } };
        const fvf = new VariableTerm('v', new Sort('FVF', new Sort('Int')));

        it('should parse well-formed quantified_field_chunk correctly', () => {
            assert.deepStrictEqual(
                HeapChunk.from({ type: 'quantified_field_chunk',
                                 field: 'fieldName',
                                 field_value_function: fvfJSON,
                                 perm: termJSON,
                                 invs: 'invs',
                                 cond: termJSON,
                                 receiver: termJSON,
                                 hints: [termJSON] }),
                new QuantifiedFieldChunk('fieldName', fvf.sort, fvf, term, 'invs', term, term, [term]));
        });

        it('should parse well-formed quantified_field_chunk correctly allowing some null keys', () => {
            assert.deepStrictEqual(
                HeapChunk.from({ type: 'quantified_field_chunk',
                                 field: 'f',
                                 field_value_function: fvfJSON,
                                 perm: termJSON,
                                 invs: null,
                                 cond: null,
                                 receiver: null,
                                 hints:  null }),
                new QuantifiedFieldChunk('f', fvf.sort, fvf, term, undefined, undefined, undefined, []));
        });

        const psfJSON = { type: 'variable', id: 'v', sort: { id: 'PSF', elementsSort: { id: 'Int' } } };
        const psf = new VariableTerm('v', new Sort('PSF', new Sort('Int')));

        it('should parse well-formed quantified_predicate_chunk correctly', () => {
            assert.deepStrictEqual(
                HeapChunk.from({ type: 'quantified_predicate_chunk',
                                 vars: [termJSON],
                                 predicate: 'p',
                                 predicate_snap_function: psfJSON,
                                 perm: termJSON,
                                 invs: 'one',
                                 cond: termJSON,
                                 singleton_args: [termJSON],
                                 hints:  [termJSON] }),
                new QuantifiedPredicateChunk('p', [term], psf.sort, psf, term, 'one', term, [term], [term]));
        });

        it('should parse well-formed quantified_predicate_chunk correctly allowing some null keys', () => {
            assert.deepStrictEqual(
                HeapChunk.from({ type: 'quantified_predicate_chunk',
                                 vars: [termJSON],
                                 predicate: 'p',
                                 predicate_snap_function: psfJSON,
                                 perm: termJSON,
                                 invs: null,
                                 cond: null,
                                 singleton_args: null,
                                 hints:  null }),
                new QuantifiedPredicateChunk('p', [term], psf.sort, psf, term, undefined, undefined, [], []));
        });

        it('should parse well-formed quantified_magic_wand_chunk correctly', () => {
            assert.deepStrictEqual(
                HeapChunk.from({ type: 'quantified_magic_wand_chunk',
                                 vars: [termJSON],
                                 predicate: 'p',
                                 wand_snap_function: psfJSON,
                                 perm: termJSON,
                                 invs: 'one',
                                 cond: termJSON,
                                 singleton_args: [termJSON],
                                 hints:  [termJSON] }),
                new QuantifiedMagicWandChunk('p', [term], psf, term, 'one', term, [term], [term]));
        });

        it('should parse well-formed quantified_magic_wand_chunk correctly allowing some null keys', () => {
            assert.deepStrictEqual(
                HeapChunk.from({ type: 'quantified_magic_wand_chunk',
                                 vars: [termJSON],
                                 predicate: 'p',
                                 wand_snap_function: psfJSON,
                                 perm: termJSON,
                                 invs: null,
                                 cond: null,
                                 singleton_args: null,
                                 hints:  null }),
                new QuantifiedMagicWandChunk('p', [term], psf, term, undefined, undefined, [], []));
        });

        it('should thrown an error when there are missing keys', () => {
            const chunkTypes = [
                'basic_predicate_chunk',
                'basic_field_chunk',
                'basic_magic_wand_chunk',
                'quantified_field_chunk',
                'quantified_predicate_chunk',
                'quantified_magic_wand_chunk'
            ]

            chunkTypes.forEach(chunkType => {
                assert.throws(() => HeapChunk.from({ type: chunkType }),
                              /A '\w+' chunk must have a '\w+' entry:/);
            });
        });

        it('should thrown an error when it receives invalid heap chunk types', () => {
            assert.throws(() => HeapChunk.from({ type: 'invalid_heap_chunk' }),
                          /Unexpected heap chunk:/);
            assert.throws(() => HeapChunk.from({ type: {} }),
                          /Heap chunks must have a 'type' entry of type 'string':/);
        });
    });
});