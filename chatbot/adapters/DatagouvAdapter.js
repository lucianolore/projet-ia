// Datagouv adapter: wraps the official data.gouv.fr MCP server
// (https://github.com/datagouv/datagouv-mcp), remote HTTP-only.
//
// This is a generic CATALOG interface, not a real-estate-specific API:
// there is no "search_property_transactions" or "score_market_health" tool.
// To answer real-estate questions (DVF transactions, DPE, SIRENE), the
// workflow is: search_datasets -> list_dataset_resources -> query_resource_data.

const BaseAdapter = require('./BaseAdapter');

class DatagouvAdapter extends BaseAdapter {
  constructor(config = {}) {
    super('datagouv', config);
    this.mcp = config.mcpTools; // Injected: MCPClient pointed at mcp.data.gouv.fr
  }

  async execute(toolName, params) {
    const method = this[`tool_${toolName}`];
    if (!method) {
      throw new Error(`Unknown tool: datagouv:${toolName}`);
    }
    return method.call(this, params);
  }

  async tool_search_datasets(params) {
    const cacheKey = `search_datasets_${JSON.stringify(params)}`;
    const cached = this.cacheGet(cacheKey);
    if (cached) return cached;

    const result = await this.mcp.call('search_datasets', {
      query: params.query,
      page: params.page || 1,
      page_size: params.page_size || 20,
      sort: params.sort,
      last_update_range: params.last_update_range,
    });

    this.cacheSet(cacheKey, result, 3600000);
    return result;
  }

  async tool_get_dataset_info(params) {
    return this.mcp.call('get_dataset_info', { dataset_id: params.dataset_id });
  }

  async tool_list_dataset_resources(params) {
    const cacheKey = `resources_${params.dataset_id}`;
    const cached = this.cacheGet(cacheKey);
    if (cached) return cached;

    const result = await this.mcp.call('list_dataset_resources', { dataset_id: params.dataset_id });
    this.cacheSet(cacheKey, result, 3600000);
    return result;
  }

  async tool_get_resource_info(params) {
    return this.mcp.call('get_resource_info', { resource_id: params.resource_id });
  }

  async tool_query_resource_data(params) {
    // Raw row access via the Tabular API. No aggregation done server-side -
    // Claude must compute averages/comparisons itself from the returned rows.
    return this.mcp.call('query_resource_data', {
      resource_id: params.resource_id,
      filter_column: params.filter_column,
      filter_operator: params.filter_operator || 'exact',
      filter_value: params.filter_value,
      sort_column: params.sort_column,
      sort_direction: params.sort_direction || 'asc',
      page: params.page || 1,
      page_size: params.page_size || 20,
    });
  }

  async tool_search_organizations(params) {
    return this.mcp.call('search_organizations', {
      query: params.query || '',
      badge: params.badge,
      name: params.name,
      business_number_id: params.business_number_id,
      page: params.page || 1,
      page_size: params.page_size || 20,
      sort: params.sort,
    });
  }

  async tool_search_dataservices(params) {
    return this.mcp.call('search_dataservices', {
      query: params.query,
      page: params.page || 1,
      page_size: params.page_size || 20,
    });
  }

  async tool_get_dataservice_info(params) {
    return this.mcp.call('get_dataservice_info', { dataservice_id: params.dataservice_id });
  }

  async tool_get_dataservice_openapi_spec(params) {
    return this.mcp.call('get_dataservice_openapi_spec', { dataservice_id: params.dataservice_id });
  }

  async tool_get_metrics(params) {
    return this.mcp.call('get_metrics', {
      dataset_id: params.dataset_id,
      resource_id: params.resource_id,
      limit: params.limit || 12,
    });
  }
}

module.exports = DatagouvAdapter;
