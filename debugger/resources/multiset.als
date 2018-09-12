abstract sig Multiset {
    ms_elems: univ -> lone Int
} {
    all i: univ.ms_elems | gt[i, 0]
}

pred empty_multiset [ ms': Multiset ] {
    no ms'.ms_elems
}

pred multiset_singleton [ e: univ, ms': Multiset ] {
    ms'.ms_elems = (e -> 1)
}

pred multiset_add [ ms1: Multiset, elem: univ, ms': Multiset ] {
    ms'.ms_elems =    { e: univ, v: Int | e in (elem - dom[ms1.ms_elems]) and v = 1 } +
                { e: univ, v: Int | e in (dom[ms1.ms_elems] - elem) and v = ms1.ms_elems[e] } +
                { e: univ, v: Int | e in (dom[ms1.ms_elems] & elem) and v = add[ms1.ms_elems[e], 1] }
}

-- fun multiset_cardinality_fun [ ms: Multiset ]: one Int {
--     sum ms.ms_elems[univ]
-- }

-- pred multiset_cardinality [ ms: Multiset, card: Int ] {
--     card = (let s = { c: Int, e: univ | (e -> c) in ms.ms_elems } |
--                     (sum i: (s).univ | mul[#(s[i]), i]) )
--     card >= 0
-- }

pred multiset_cardinality [ ms: Multiset, card: CustomInt ] {
    card.value = (let s = { c: Int, e: univ | (e -> c) in ms.ms_elems } |
                    (sum i: (s).univ | mul[#(s[i]), i]) )
    card.value >= 0
}

pred multiset_difference [ ms1, ms2, ms': Multiset ] {
    ms'.ms_elems = { e: univ, v: Int | e in (dom[ms1.ms_elems] - dom[ms2.ms_elems]) and v = ms1.ms_elems[e] } +
                { e: univ, v: Int | e in (dom[ms1.ms_elems] & dom[ms2.ms_elems]) and
                                    e.(ms2.ms_elems) < e.(ms1.ms_elems) and
                                    v = minus[e.(ms1.ms_elems), e.(ms2.ms_elems)] }
}

pred multiset_intersection [ ms1, ms2, ms': Multiset ] {
    ms'.ms_elems = { e: univ, v: Int | e in (dom[ms1.ms_elems] & dom[ms2.ms_elems]) and v = min[e.(ms1.ms_elems) + e.(ms2.ms_elems)] }
}

pred multiset_union [ ms1, ms2, ms': Multiset ] {
    ms'.ms_elems = { e: univ, v: Int | e in (dom[ms2.ms_elems] - dom[ms1.ms_elems]) and v = ms2.ms_elems[e] } +
                { e: univ, v: Int | e in (dom[ms1.ms_elems] - dom[ms2.ms_elems]) and v = ms1.ms_elems[e] } +
                { e: univ, v: Int | e in (dom[ms1.ms_elems] & dom[ms2.ms_elems]) and v = add[ms1.ms_elems[e], ms2.ms_elems[e]] }
}

pred multiset_subset [ ms1, ms2: Multiset ] {
    dom[ms1.ms_elems] in dom[ms2.ms_elems]
    { all e: dom[ms1.ms_elems] | ms1.ms_elems[e] <= ms2.ms_elems[e] }
}

pred multiset_count [ ms1: Multiset, e: univ, c: CustomInt ] {
    c.value = ms1.ms_elems[e]
} 

-- pred multiset_count [ ms1: Multiset, e: univ, c: Int ] {
--     c = ms1.ms_elems[e]
-- } 

-- fun multiset_count_fun [ ms1: Multiset, e: univ ]: one Int {
--     ms1.ms_elems[e]
-- } 

pred multiset_equals [ ms1, ms2: Multiset ] {
    ms1.ms_elems = ms2.ms_elems
}