
abstract sig Perm {
    num: one Int,
    denom: one Int
} {
    num >= 0
    denom > 0
    // Silicon does not define this in SMT and defining it here would prevent us
    // from having sums of permissions that exceed W
    // num <= denom
}
lone sig W in Perm {} {
    num = 1
    denom = 1
}
lone sig Z in Perm {} {
    num = 0
    denom = 1
}

fun perm_less[ p1, p2: Perm ]: one Bool {
  (mul[p1.num, p2.denom] < mul[p2.num, p1.denom]) => True else False
}

fun perm_at_most[ p1, p2: Perm ]: one Bool {
  (mul[p1.num, p2.denom] <= mul[p2.num, p1.denom]) => True else False
}

fun perm_at_least[ p1, p2: Perm ]: one Bool {
  (mul[p1.num, p2.denom] >= mul[p2.num, p1.denom]) => True else False
}

fun perm_greater[ p1, p2: Perm ]: one Bool {
  (mul[p1.num, p2.denom] > mul[p2.num, p1.denom]) => True else False
}

fun perm_plus[ p1, p2: Perm ]: one Perm {
  { p': Perm | (p1.denom = p2.denom) =>
                 (p'.num = plus[p1.num, p2.num] &&
                  p'.denom = p1.denom)
               else
                 (p'.num = plus[mul[p1.num, p2.denom], mul[p2.num, p1.denom]] &&
                  p'.denom = mul[p1.denom, p2.denom]) }
}


fun perm_minus[ p1, p2: Perm ]: one Perm {
  { p': Perm | p'.num = minus[mul[p1.num, p2.denom], mul[p2.num, p1.denom]] &&
               p'.denom = mul[p1.denom, p2.denom]
  }
}

fun int_perm_div[ p: Perm, d: Int ]: one Perm {
  { p': Perm | p'.num = p.num &&
               p'.denom = mul[p.denom, d] }
}

fun perm_mul[ p1, p2: Perm ]: one Perm {
  { p': Perm | p'.num = mul[p1.num, p2.num] &&
               p'.denom = mul[p1.denom, p2.denom] }
}

fun int_perm_mul[ i: Int, p: Perm ]: one Perm {
  { p': Perm | p'.num = mul[p.num, i] &&
               p'.denom = p.denom }
}

fun perm_min[ p1, p2: Perm ]: one Perm {
  mul[p1.num, p2.denom] < mul[p2.num, p1.num] => p1 else p2
}

fun perm_new [ n, d: Int ]: one Perm {
  { p': Perm | p'.num = n && p'.denom = d }
}