abstract sig Seq {
	// seq_rel: Int -> lone univ
	seq_rel: seq univ
} {
	isSeq[seq_rel]
}

pred seq_ranged [ from, to: Int, s': Seq ] {
	// { all i: Int | 0 <= i && i < sub[to, from] => s[i] = plus[from, i] }
	// #s = sub[to, from]
	s'.seq_rel = subseq[iden, from, sub[to, 1]]
}
pred seq_singleton [ e: univ, s': Seq ] {
	s'.seq_rel[0] = e
	#(s'.seq_rel) = 1
}
// NOTE: The sequence resulting from the wrapped 'append' operation may be
//		 truncated if the sequences are too long.
pred seq_append [ s1, s2, s': Seq ] {
	s'.seq_rel = append[s1.seq_rel, s2.seq_rel]
}

fun seq_length [ s: Seq ]: one Int {
	#(s.seq_rel)
}

fun seq_at [ s: Seq, i: Int ]: one univ {
	s.seq_rel[i]
}

pred seq_take [ s: Seq, i: Int, s': Seq ] {
	let to = sub[i, 1] |
	s'.seq_rel = subseq[ s.seq_rel, 0, to]
}
pred seq_drop [ s: Seq, i: Int, s': Seq ] {
	let to = sub[#s.seq_rel, 1] |
	s'.seq_rel = subseq[ s.seq_rel, i, to ]
}
pred seq_in [ s1: Seq, e: univ ] {
	e in elems[s1.seq_rel]
}
pred seq_update [ s: Seq, i: Int, e: univ, s': Seq ] {
	s'.seq_rel = setAt[s.seq_rel, i, e]
} 