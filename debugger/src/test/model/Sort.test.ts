import * as assert from 'assert';
import { Sort } from "../../model/Sort";

describe('Sort', () => {
    describe('.from()', () => {
        it('should parse well-formed simple sorts correctly', () => {
            assert.deepStrictEqual(Sort.from({ id: 'Int' }), new Sort('Int'));
        });

        it('should parse well-formed complex sorts correctly', () => {
            assert.deepStrictEqual(
                Sort.from({ id: 'Set', elementsSort: { id: 'Int' } }),
                new Sort('Set', new Sort('Int')));
        });

        it('should parse well-formed deep complex sorts correctly', () => {
            assert.deepStrictEqual(
                Sort.from({ id: 'Set',
                            elementsSort: { id: 'Set',
                                            elementsSort: { id: 'Set',
                                                            elementsSort: { id: 'Int' } }
                                          }
                          }),
                new Sort('Set', new Sort('Set', new Sort('Set', new Sort('Int')))));
        });

        it('should throw an error when it receives invalid JSON objects', () => {
            assert.throws(() => Sort.from({}),
                          /A 'sort' object must have a 'id' entry:/);

            assert.throws(() => Sort.from({ id: 'Set', elementsSort: {} }),
                          /A 'sort' object must have a 'id' entry:/);
        });
    });
});
