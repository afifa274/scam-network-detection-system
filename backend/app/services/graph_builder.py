import networkx as nx
import community as community_louvain
import uuid

def build_graph_from_entities(entities: dict):
    G = nx.Graph()
    message_id = f"msg_{uuid.uuid4().hex[:6]}"
    G.add_node(message_id, type="message")

    for entity_type, values in entities.items():
        for value in values:
            G.add_node(value, type=entity_type)
            G.add_edge(message_id, value)
    return G

def get_graph_info(G):
    return {"total_nodes": G.number_of_nodes(), "total_edges": G.number_of_edges()}

def get_central_nodes(G):
    if G.number_of_nodes() == 0: return []
    centrality = nx.degree_centrality(G)
    sorted_nodes = sorted(centrality.items(), key=lambda x: x[1], reverse=True)
    
    result = []
    for node, score in sorted_nodes:
        if G.nodes[node].get("type") != "message":
            result.append({"entity": node, "centrality_score": round(score, 3)})
    return result[:5]

def detect_clusters(G):
    if G.number_of_nodes() < 2: return {}
    return community_louvain.best_partition(G)

def get_graph_data(G):
    clusters = detect_clusters(G)
    nodes = []
    for node, data in G.nodes(data=True):
        nodes.append({
            "id": node,
            "type": data.get("type", "unknown"),
            "node_risk": data.get("node_risk", 0),
            "cluster": clusters.get(node, 0)
        })

    links = [{"source": u, "target": v} for u, v in G.edges()]
    return {"nodes": nodes, "links": links}