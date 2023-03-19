
> position-strings@2.0.0 benchmarks
> ts-node --project tsconfig.dev.json benchmarks/main.ts

## Run: all ops; rotate never

### length

- Average: 34
- Median: 33
- 99th percentile: 52
- Max: 56

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

### valueIndex

- Average: 615
- Median: 208
- 99th percentile: 5780
- Max: 7603

### PositionSource memory usage

- Map size: 3333
- Sum of map key lengths: 115367

## Run: all ops; rotate every 1000 ops

### length

- Average: 112
- Median: 110
- 99th percentile: 207
- Max: 238

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

### valueIndex

- Average: 185
- Median: 108
- 99th percentile: 851
- Max: 999

### PositionSource memory usage

- Map size: 20
- Sum of map key lengths: 2594

## Run: 10000 ops; rotate never

### length

- Average: 24
- Median: 26
- 99th percentile: 33
- Max: 36

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

### valueIndex

- Average: 293
- Median: 183
- 99th percentile: 1029
- Max: 1069

### PositionSource memory usage

- Map size: 151
- Sum of map key lengths: 3817

## Run: 10000 ops; rotate every 1000 ops

### length

- Average: 51
- Median: 50
- 99th percentile: 87
- Max: 87

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

### valueIndex

- Average: 173
- Median: 113
- 99th percentile: 686
- Max: 759

### PositionSource memory usage

- Map size: 7
- Sum of map key lengths: 587

