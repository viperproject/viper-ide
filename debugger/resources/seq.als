abstract sig Seq {
	// rel: Int -> lone univ
	rel: seq univ
} {
	isSeq[rel]
}

pred seq_ranged [ from, to: Int, s': Seq ] {
	// { all i: Int | 0 <= i && i < sub[to, from] => s[i] = plus[from, i] }
	// #s = sub[to, from]
	s'.rel = subseq[iden, from, sub[to, 1]]
}
pred seq_singleton [ e: univ, s': Seq ] {
	s'.rel[0] = e
	#(s'.rel) = 1
}
// NOTE: The sequence resulting from the wrapped 'append' operation may be
//		 truncated if the sequences are too long.
pred seq_append [ s1, s2, s': Seq ] {
	s'.rel = append[s1.rel, s2.rel]
}
pred seq_length [ s: Seq, l: Int ] {
	#(s.rel) = l
}
pred seq_at [ s: Seq, i: Int, e: one univ ] {
	s.rel[i] = e
}
pred seq_take [ s: Seq, i: Int, s': Seq ] {
	let to = sub[i, 1] |
	s'.rel = subseq[ s.rel, 0, to]
}
pred seq_drop [ s: Seq, i: Int, s': Seq ] {
	let to = sub[#s.rel, 1] |
	s'.rel = subseq[ s.rel, i, to ]
}
pred seq_in [ s1: Seq, e: univ ] {
	e in elems[s1.rel]
}
pred seq_update [ s: Seq, i: Int, e: univ, s': Seq ] {
	s'.rel = setAt[s.rel, i, e]
} 