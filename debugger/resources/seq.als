abstract sig Seq {
	seq_rel: seq univ
} {
	isSeq[seq_rel]
}

pred seq_ranged [ from, to: Integer, s': Seq ] {
	let ints = { i: Int, ci: Integer | ci.value = i and from.value <= i and i < to.value } |
	#ints = sub[to.value, from.value] and
	s'.seq_rel = subseq[ints, from.value, sub[to.value, 1]]
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

-- fun seq_length [ s: Seq ]: one Int {
--     #(s.seq_rel)
-- }

pred seq_length [ s: Seq, i: Integer ] {
	#(s.seq_rel) = i.value
}

fun seq_at [ s: Seq, i: Integer ]: one univ {
    s.seq_rel[i.value]
}

pred seq_take [ s: Seq, i: Integer, s': Seq ] {
	let to = sub[i.value, 1] |
	s'.seq_rel = subseq[ s.seq_rel, 0, to]
}

pred seq_drop [ s: Seq, i: Integer, s': Seq ] {
	let to = sub[#s.seq_rel, 1] |
	s'.seq_rel = subseq[ s.seq_rel, i.value, to ]
}

pred seq_in [ s1: Seq, e: univ ] {
	e in elems[s1.seq_rel]
}
pred seq_update [ s: Seq, i: Integer, e: univ, s': Seq ] {
	s'.seq_rel = setAt[s.seq_rel, i.value, e]
} 