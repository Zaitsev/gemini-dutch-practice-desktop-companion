package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"net/url"
	"strconv"
)

const ProjectId = "gemini-dutch-practice-latest"
const ProdDatabaseId = "gemini-dutch-practice-v1"
const EmulatorDatabaseId = "(default)"

type Word struct {
	Id           string                 `json:"id"`
	Dutch        string                 `json:"dutch"`
	English      string                 `json:"english"`
	Context      string                 `json:"context,omitempty"`
	AddedAt      int64                  `json:"addedAt"`
	CreatorId    string                 `json:"creatorId"`
	Examples     []interface{}          `json:"examples,omitempty"`
	SrsLevel     int                    `json:"srsLevel"`
	NextReviewAt int64                  `json:"nextReviewAt"`
}

type FirestoreClient struct {
	idToken      string
	uid          string
	useEmulator  bool
	emulatorHost string
}

func NewFirestoreClient(idToken, uid string, useEmulator bool, emulatorHost string) *FirestoreClient {
	if emulatorHost == "" {
		emulatorHost = "127.0.0.1"
	}
	return &FirestoreClient{
		idToken:      idToken,
		uid:          uid,
		useEmulator:  useEmulator,
		emulatorHost: emulatorHost,
	}
}

// GetBaseUrl returns the base REST URL for Firestore
func (fc *FirestoreClient) GetBaseUrl() string {
	if fc.useEmulator {
		return fmt.Sprintf("http://%s:8080/v1/projects/%s/databases/%s/documents", fc.emulatorHost, ProjectId, EmulatorDatabaseId)
	}
	return fmt.Sprintf("https://firestore.googleapis.com/v1/projects/%s/databases/%s/documents", ProjectId, ProdDatabaseId)
}

// GetRequest creates a HTTP request with standard Auth headers
func (fc *FirestoreClient) GetRequest(method, url string, body []byte) (*http.Request, error) {
	req, err := http.NewRequest(method, url, bytes.NewBuffer(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if !fc.useEmulator && fc.idToken != "" {
		req.Header.Set("Authorization", "Bearer "+fc.idToken)
	}
	return req, nil
}

// GetUserDictionary fetches SRS mappings from userDictionaries/{uid}
func (fc *FirestoreClient) GetUserDictionary() (map[string]map[string]int64, error) {
	docUrl := fmt.Sprintf("%s/userDictionaries/%s", fc.GetBaseUrl(), fc.uid)
	req, err := fc.GetRequest("GET", docUrl, nil)
	if err != nil {
		return nil, err
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		// No dictionary found, return empty map
		return make(map[string]map[string]int64), nil
	}

	if resp.StatusCode != http.StatusOK {
		body, _ := ioutil.ReadAll(resp.Body)
		return nil, fmt.Errorf("failed to get user dictionary (status %d): %s", resp.StatusCode, string(body))
	}

	var response map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return nil, err
	}

	// Parser for nested Firestore fields mapping: words -> mapValue -> fields -> wordId -> mapValue -> fields -> (srsLevel, nextReviewAt)
	srsMap := make(map[string]map[string]int64)
	fields, ok := response["fields"].(map[string]interface{})
	if !ok {
		return srsMap, nil
	}

	wordsObj, ok := fields["words"].(map[string]interface{})
	if !ok {
		return srsMap, nil
	}

	mapValue, ok := wordsObj["mapValue"].(map[string]interface{})
	if !ok {
		return srsMap, nil
	}

	wordFields, ok := mapValue["fields"].(map[string]interface{})
	if !ok {
		return srsMap, nil
	}

	for wordId, wordData := range wordFields {
		wordDataMap, ok := wordData.(map[string]interface{})
		if !ok {
			continue
		}
		wordMapValue, ok := wordDataMap["mapValue"].(map[string]interface{})
		if !ok {
			continue
		}
		subFields, ok := wordMapValue["fields"].(map[string]interface{})
		if !ok {
			continue
		}

		srsLevelVal := int64(0)
		if srsLevelObj, exists := subFields["srsLevel"].(map[string]interface{}); exists {
			if srsLStr, ok := srsLevelObj["integerValue"].(string); ok {
				srsLevelVal, _ = strconv.ParseInt(srsLStr, 10, 64)
			}
		}

		nextReviewVal := int64(0)
		if nextReviewObj, exists := subFields["nextReviewAt"].(map[string]interface{}); exists {
			if nextRStr, ok := nextReviewObj["integerValue"].(string); ok {
				nextReviewVal, _ = strconv.ParseInt(nextRStr, 10, 64)
			}
		}

		srsMap[wordId] = map[string]int64{
			"srsLevel":     srsLevelVal,
			"nextReviewAt": nextReviewVal,
		}
	}

	return srsMap, nil
}

// GetWordsByCreator fetches all word documents where creatorId == uid
func (fc *FirestoreClient) GetWordsByCreator() ([]Word, error) {
	queryUrl := fmt.Sprintf("%s:runQuery", fc.GetBaseUrl())

	// Build runQuery payload
	queryPayload := map[string]interface{}{
		"structuredQuery": map[string]interface{}{
			"from": []interface{}{
				map[string]interface{}{"collectionId": "words"},
			},
			"where": map[string]interface{}{
				"fieldFilter": map[string]interface{}{
					"field": map[string]interface{}{"fieldPath": "creatorId"},
					"op":    "EQUAL",
					"value": map[string]interface{}{"stringValue": fc.uid},
				},
			},
		},
	}

	body, err := json.Marshal(queryPayload)
	if err != nil {
		return nil, err
	}

	req, err := fc.GetRequest("POST", queryUrl, body)
	if err != nil {
		return nil, err
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := ioutil.ReadAll(resp.Body)
		return nil, fmt.Errorf("failed to query words (status %d): %s", resp.StatusCode, string(bodyBytes))
	}

	var results []map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		return nil, err
	}

	words := make([]Word, 0)
	for _, result := range results {
		docObj, ok := result["document"].(map[string]interface{})
		if !ok {
			continue
		}

		name, _ := docObj["name"].(string)
		wordId := ""
		// Extract wordId from end of document name: projects/.../documents/words/{wordId}
		for i := len(name) - 1; i >= 0; i-- {
			if name[i] == '/' {
				wordId = name[i+1:]
				break
			}
		}

		fields, ok := docObj["fields"].(map[string]interface{})
		if !ok {
			continue
		}

		dutchVal := ""
		if obj, exists := fields["dutch"].(map[string]interface{}); exists {
			dutchVal, _ = obj["stringValue"].(string)
		}

		englishVal := ""
		if obj, exists := fields["english"].(map[string]interface{}); exists {
			englishVal, _ = obj["stringValue"].(string)
		}

		contextVal := ""
		if obj, exists := fields["context"].(map[string]interface{}); exists {
			contextVal, _ = obj["stringValue"].(string)
		}

		addedAtVal := int64(0)
		if obj, exists := fields["addedAt"].(map[string]interface{}); exists {
			if str, ok := obj["integerValue"].(string); ok {
				addedAtVal, _ = strconv.ParseInt(str, 10, 64)
			}
		}

		creatorIdVal := ""
		if obj, exists := fields["creatorId"].(map[string]interface{}); exists {
			creatorIdVal, _ = obj["stringValue"].(string)
		}

		// Optional examples extraction
		examplesList := make([]interface{}, 0)
		if obj, exists := fields["examples"].(map[string]interface{}); exists {
			if arrayVal, ok := obj["arrayValue"].(map[string]interface{}); ok {
				if values, ok := arrayVal["values"].([]interface{}); ok {
					examplesList = values
				}
			}
		}

		words = append(words, Word{
			Id:        wordId,
			Dutch:     dutchVal,
			English:   englishVal,
			Context:   contextVal,
			AddedAt:   addedAtVal,
			CreatorId: creatorIdVal,
			Examples:  examplesList,
		})
	}

	return words, nil
}

// UpdateWordSRS updates nested word SRS fields in userDictionaries/{uid} using patch update masks
func (fc *FirestoreClient) UpdateWordSRS(wordId string, srsLevel int, nextReviewAt int64) error {
	baseUrl := fc.GetBaseUrl()
	docUrl := fmt.Sprintf("%s/userDictionaries/%s", baseUrl, fc.uid)

	// Format nested field update masks
	u, err := url.Parse(docUrl)
	if err != nil {
		return err
	}
	q := u.Query()
	q.Add("updateMask.fieldPaths", fmt.Sprintf("words.%s.srsLevel", wordId))
	q.Add("updateMask.fieldPaths", fmt.Sprintf("words.%s.nextReviewAt", wordId))
	u.RawQuery = q.Encode()

	// Firestore patch payload
	payload := map[string]interface{}{
		"fields": map[string]interface{}{
			"words": map[string]interface{}{
				"mapValue": map[string]interface{}{
					"fields": map[string]interface{}{
						wordId: map[string]interface{}{
							"mapValue": map[string]interface{}{
								"fields": map[string]interface{}{
									"srsLevel": map[string]interface{}{
										"integerValue": strconv.Itoa(srsLevel),
									},
									"nextReviewAt": map[string]interface{}{
										"integerValue": strconv.FormatInt(nextReviewAt, 10),
									},
								},
							},
						},
					},
				},
			},
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := fc.GetRequest("PATCH", u.String(), body)
	if err != nil {
		return err
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := ioutil.ReadAll(resp.Body)
		return fmt.Errorf("failed to patch srs metadata (status %d): %s", resp.StatusCode, string(bodyBytes))
	}

	return nil
}
