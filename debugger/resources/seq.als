abstract sig Seq {
	rel: Int -> lone univ
} {
	isSeq[rel]
}

fun seq_ranged [ s: Seq, from, to: Int ]: one Seq {
	{ s': Seq | s'.rel = subseq[ s.rel, from, to ] }
}
fun seq_singleton [ e: univ ]: one Seq {
	{ s': Seq | (0 -> e) in s'.rel && #(s'.rel) = 1 }
}
// NOTE: The wrapped 'add' operation might not return a new sequence in case
//		 we exceed the length of available indices.
fun seq_append [ s1: Seq, e: univ ]: one Seq {
	{ s': Seq | s'.rel = add[s1.rel, e] }
}
fun seq_length [ s: Seq ]: one Int {
	#(s.rel)
}
fun seq_at [ s: Seq, i: Int ]: one univ {
	s.rel[i]
}
fun seq_take [ s: Seq, i: Int ]: one Seq {
	{ s': Seq | s'.rel = subseq[ s.rel, 0, i] }
}
fun seq_drop [ s: Seq, i: Int ]: one Seq {
	let to = sub[#s.rel, 1] |
	{ s': Seq | s'.rel = subseq[ s.rel, i, to ] }
}
fun seq_in [ s1, s2: Seq ]: one Bool {
	(s1.rel in s2.rel) => True else False
}
fun seq_update [ s: Seq, i: Int, e: univ ]: one Seq {
	{ s': Seq | s'.rel = setAt[s.rel, i, e] }
} 