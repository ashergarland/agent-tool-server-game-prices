using '../main.bicep'

param environmentName = 'dev'
param location = 'eastus'
param deployApp = false
param containerImage = 'invalid.example/agent-tool-server-game-prices:not-deployed'
param minReplicas = 0
param maxReplicas = 1
