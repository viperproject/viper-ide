abstract sig Multiset {
	elems: univ -> lone Int
} {
	all i: univ.elems | gt[i, 0]
}

pred empty_multiset [ ms': Multiset ] {
    no ms'.elems
}

pred multiset_singleton [ e: univ, ms': Multiset ] {
	ms'.elems = (e -> 1)
}

pred multiset_add [ ms1: Multiset, elem: univ, ms': Multiset ] {
	ms'.elems =	{ e: univ, v: Int | e in (elem - dom[ms1.elems]) and v = 1 } +
				{ e: univ, v: Int | e in (dom[ms1.elems] - elem) and v = ms1.elems[e] } +
				{ e: univ, v: Int | e in (dom[ms1.elems] & elem) and v = add[ms1.elems[e], 1] }
}

fun multiset_cardinality_fun [ ms: Multiset ]: one Int {
    sum ms.elems[univ]
}

pred multiset_cardinality [ ms: Multiset, card: Int ] {
	card = (let s = { c: Int, e: univ | (e -> c) in ms.elems } |
					(sum i: (s).univ | mul[#(s[i]), i]) )
	card >= 0
}

pred multiset_difference [ ms1, ms2, ms': Multiset ] {
	ms'.elems = { e: univ, v: Int | e in (dom[ms1.elems] - dom[ms2.elems]) and v = ms1.elems[e] } +
				{ e: univ, v: Int | e in (dom[ms1.elems] & dom[ms2.elems]) and
									e.(ms2.elems) < e.(ms1.elems) and
									v = minus[e.(ms1.elems), e.(ms2.elems)] }
}

pred multiset_intersection [ ms1, ms2, ms': Multiset ] {
	ms'.elems = { e: univ, v: Int | e in (dom[ms1.elems] & dom[ms2.elems]) and v = min[e.(ms1.elems) + e.(ms2.elems)] }
}

pred multiset_union [ ms1, ms2, ms': Multiset ] {
	ms'.elems = { e: univ, v: Int | e in (dom[ms2.elems] - dom[ms1.elems]) and v = ms2.elems[e] } +
				{ e: univ, v: Int | e in (dom[ms1.elems] - dom[ms2.elems]) and v = ms1.elems[e] } +
				{ e: univ, v: Int | e in (dom[ms1.elems] & dom[ms2.elems]) and v = add[ms1.elems[e], ms2.elems[e]] }
}

pred multiset_subset [ ms1, ms2: Multiset ] {
	dom[ms1.elems] in dom[ms2.elems]
	{ all e: dom[ms1.elems] | ms1.elems[e] <= ms2.elems[e] }
}

pred multiset_count [ ms1: Multiset, e: univ, c: Int ] {
	c = ms1.elems[e]
} 

fun multiset_count_fun [ ms1: Multiset, e: univ ]: one Int {
	ms1.elems[e]
} 

pred multiset_equals [ ms1, ms2: Multiset ] {
    ms1.elems = ms2.elems
}