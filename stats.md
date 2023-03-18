
> position-strings@1.0.3 benchmarks
> ts-node --project tsconfig.dev.json benchmarks/main.ts

## Run: all ops; rotate never

### length

- Average: 33
- Median: 32
- 99th percentile: 51
- Max: 55

### longNodes

- Average: 1
- Median: 1
- 99th percentile: 1
- Max: 1

### nodes

- Average: 9
- Median: 8
- 99th percentile: 15
- Max: 17

### valueIndexCount

- Average: 565
- Median: 204
- 99th percentile: 4786
- Max: 6207

### PositionSource memory usage

- Map size: 3333
- Sum of map key lengths: 111946

## Run: all ops; rotate every 1000 ops

### length

- Average: 104
- Median: 102
- 99th percentile: 191
- Max: 220

### longNodes

- Average: 8
- Median: 8
- 99th percentile: 16
- Max: 18

### nodes

- Average: 13
- Median: 13
- 99th percentile: 24
- Max: 26

### valueIndexCount

- Average: 185
- Median: 107
- 99th percentile: 851
- Max: 999

### PositionSource memory usage

- Map size: 20
- Sum of map key lengths: 2395

## Run: 10000 ops; rotate never

### length

- Average: 23
- Median: 25
- 99th percentile: 32
- Max: 35

### longNodes

- Average: 1
- Median: 1
- 99th percentile: 1
- Max: 1

### nodes

- Average: 5
- Median: 6
- 99th percentile: 8
- Max: 9

### valueIndexCount

- Average: 293
- Median: 183
- 99th percentile: 1029
- Max: 1069

### PositionSource memory usage

- Map size: 151
- Sum of map key lengths: 3666

## Run: 10000 ops; rotate every 1000 ops

### length

- Average: 48
- Median: 47
- 99th percentile: 81
- Max: 81

### longNodes

- Average: 3
- Median: 3
- 99th percentile: 6
- Max: 6

### nodes

- Average: 7
- Median: 7
- 99th percentile: 11
- Max: 12

### valueIndexCount

- Average: 173
- Median: 113
- 99th percentile: 686
- Max: 759

### PositionSource memory usage

- Map size: 7
- Sum of map key lengths: 545

