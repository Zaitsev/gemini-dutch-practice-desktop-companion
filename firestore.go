package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"

	"github.com/google/uuid"
)

const ProjectId = "gemini-dutch-practice-latest"
const ProdDatabaseId = "gemini-dutch-practice-v1"
const EmulatorDatabaseId = "(default)"
const defaultDeckID = "default"
const defaultDeckName = "Default"

type Deck struct {
	Id   string `json:"id"`
	Name string `json:"name"`
}

type DictionaryWordState struct {
	SrsLevel    int64    `json:"srsLevel"`
	NextReviewAt int64   `json:"nextReviewAt"`
	DeckIds     []string `json:"deckIds"`
}

type DictionaryState struct {
	Words map[string]DictionaryWordState `json:"words"`
	Decks []Deck                         `json:"decks"`
}

type Word struct {
	Id                  string                 `json:"id"`
	Dutch               string                 `json:"dutch"`
	English             string                 `json:"english"`
	Context             string                 `json:"context,omitempty"`
	AddedAt             int64                  `json:"addedAt"`
	CreatorId           string                 `json:"creatorId"`
	Examples            []interface{}          `json:"examples,omitempty"`
	SrsLevel            int                    `json:"srsLevel"`
	NextReviewAt        int64                  `json:"nextReviewAt"`
	DeckIds             []string               `json:"deckIds,omitempty"`
	WordAudioUrl        string                 `json:"wordAudioUrl,omitempty"`
	WordTeacherAudioUrl string                 `json:"wordTeacherAudioUrl,omitempty"`
}

type BatchGetResult struct {
	Found    *FirestoreDocument `json:"found,omitempty"`
	Missing  string             `json:"missing,omitempty"`
	ReadTime string             `json:"readTime"`
}

type FirestoreDocument struct {
	Name       string                 `json:"name"`
	Fields     map[string]interface{} `json:"fields"`
	CreateTime string                 `json:"createTime"`
	UpdateTime string                 `json:"updateTime"`
}

func parseWordFromFields(wordId string, fields map[string]interface{}) Word {
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

	examplesList := make([]interface{}, 0)
	if obj, exists := fields["examples"].(map[string]interface{}); exists {
		if arrayVal, ok := obj["arrayValue"].(map[string]interface{}); ok {
			if values, ok := arrayVal["values"].([]interface{}); ok {
				examplesList = values
			}
		}
	}

	wordAudioUrlVal := ""
	if obj, exists := fields["wordAudioUrl"].(map[string]interface{}); exists {
		wordAudioUrlVal, _ = obj["stringValue"].(string)
	}

	wordTeacherAudioUrlVal := ""
	if obj, exists := fields["wordTeacherAudioUrl"].(map[string]interface{}); exists {
		wordTeacherAudioUrlVal, _ = obj["stringValue"].(string)
	}

	return Word{
		Id:                  wordId,
		Dutch:               dutchVal,
		English:             englishVal,
		Context:             contextVal,
		AddedAt:             addedAtVal,
		CreatorId:           creatorIdVal,
		Examples:            examplesList,
		WordAudioUrl:        wordAudioUrlVal,
		WordTeacherAudioUrl: wordTeacherAudioUrlVal,
	}
}

func defaultDictionaryData() DictionaryState {
	return DictionaryState{
		Words: map[string]DictionaryWordState{},
		Decks: []Deck{{Id: defaultDeckID, Name: defaultDeckName}},
	}
}

func copyDictionaryData(data DictionaryState) DictionaryState {
	cloned := DictionaryState{
		Words: make(map[string]DictionaryWordState, len(data.Words)),
		Decks: append([]Deck(nil), data.Decks...),
	}
	for wordID, wordState := range data.Words {
		clonedState := wordState
		clonedState.DeckIds = append([]string(nil), wordState.DeckIds...)
		cloned.Words[wordID] = clonedState
	}
	return cloned
}

func normalizeDictionaryData(data DictionaryState) (DictionaryState, bool) {
	result := copyDictionaryData(data)
	changed := false

	if len(result.Decks) == 0 {
		result.Decks = []Deck{{Id: defaultDeckID, Name: defaultDeckName}}
		changed = true
	}

	deckLookup := make(map[string]struct{}, len(result.Decks))
	defaultDeckFound := false
	filteredDecks := make([]Deck, 0, len(result.Decks)+1)
	for _, deck := range result.Decks {
		deck.Id = strings.TrimSpace(deck.Id)
		deck.Name = strings.TrimSpace(deck.Name)
		if deck.Id == "" {
			changed = true
			continue
		}
		if deck.Name == "" {
			deck.Name = deck.Id
			changed = true
		}
		if _, exists := deckLookup[deck.Id]; exists {
			changed = true
			continue
		}
		if deck.Id == defaultDeckID {
			defaultDeckFound = true
		}
		deckLookup[deck.Id] = struct{}{}
		filteredDecks = append(filteredDecks, deck)
	}

	if !defaultDeckFound {
		filteredDecks = append([]Deck{{Id: defaultDeckID, Name: defaultDeckName}}, filteredDecks...)
		deckLookup[defaultDeckID] = struct{}{}
		changed = true
	}

	for wordID, wordState := range result.Words {
		normalizedDeckIds := make([]string, 0, len(wordState.DeckIds)+1)
		seen := make(map[string]struct{}, len(wordState.DeckIds)+1)
		for _, deckID := range wordState.DeckIds {
			deckID = strings.TrimSpace(deckID)
			if deckID == "" {
				continue
			}
			if _, exists := deckLookup[deckID]; !exists {
				changed = true
				continue
			}
			if _, exists := seen[deckID]; exists {
				changed = true
				continue
			}
			seen[deckID] = struct{}{}
			normalizedDeckIds = append(normalizedDeckIds, deckID)
		}
		if len(normalizedDeckIds) == 0 {
			normalizedDeckIds = []string{defaultDeckID}
			changed = true
		} else if _, exists := seen[defaultDeckID]; !exists {
			normalizedDeckIds = append([]string{defaultDeckID}, normalizedDeckIds...)
			changed = true
		}
		wordState.DeckIds = normalizedDeckIds
		result.Words[wordID] = wordState
	}

	result.Decks = filteredDecks
	return result, changed
}

func sortDictionaryDecks(decks []Deck) []Deck {
	sorted := append([]Deck(nil), decks...)
	sort.SliceStable(sorted, func(i, j int) bool {
		if sorted[i].Id == defaultDeckID {
			return true
		}
		if sorted[j].Id == defaultDeckID {
			return false
		}
		nameI := strings.ToLower(sorted[i].Name)
		nameJ := strings.ToLower(sorted[j].Name)
		if nameI == nameJ {
			return sorted[i].Id < sorted[j].Id
		}
		return nameI < nameJ
	})
	return sorted
}

func encodeDictionaryData(data DictionaryState) map[string]interface{} {
	deckValues := make([]interface{}, 0, len(data.Decks))
	for _, deck := range data.Decks {
		deckValues = append(deckValues, map[string]interface{}{
			"mapValue": map[string]interface{}{
				"fields": map[string]interface{}{
					"id": map[string]interface{}{"stringValue": deck.Id},
					"name": map[string]interface{}{"stringValue": deck.Name},
				},
			},
		})
	}

	wordFields := make(map[string]interface{}, len(data.Words))
	for wordID, wordState := range data.Words {
		deckIds := make([]interface{}, 0, len(wordState.DeckIds))
		for _, deckID := range wordState.DeckIds {
			deckIds = append(deckIds, map[string]interface{}{"stringValue": deckID})
		}
		wordFields[wordID] = map[string]interface{}{
			"mapValue": map[string]interface{}{
				"fields": map[string]interface{}{
					"srsLevel": map[string]interface{}{"integerValue": strconv.FormatInt(wordState.SrsLevel, 10)},
					"nextReviewAt": map[string]interface{}{"integerValue": strconv.FormatInt(wordState.NextReviewAt, 10)},
					"deckIds": map[string]interface{}{
						"arrayValue": map[string]interface{}{"values": deckIds},
					},
				},
			},
		}
	}

	return map[string]interface{}{
		"decks": map[string]interface{}{
			"arrayValue": map[string]interface{}{"values": deckValues},
		},
		"words": map[string]interface{}{
			"mapValue": map[string]interface{}{"fields": wordFields},
		},
	}
}

func parseDictionaryData(response map[string]interface{}) DictionaryState {
	data := defaultDictionaryData()
	fields, ok := response["fields"].(map[string]interface{})
	if !ok {
		return data
	}

	if decksObj, ok := fields["decks"].(map[string]interface{}); ok {
		if arrayVal, ok := decksObj["arrayValue"].(map[string]interface{}); ok {
			if values, ok := arrayVal["values"].([]interface{}); ok {
				parsedDecks := make([]Deck, 0, len(values))
				for _, rawDeck := range values {
					deckMap, ok := rawDeck.(map[string]interface{})
					if !ok {
						continue
					}
					deckValue, ok := deckMap["mapValue"].(map[string]interface{})
					if !ok {
						continue
					}
					deckFields, ok := deckValue["fields"].(map[string]interface{})
					if !ok {
						continue
					}
					deck := Deck{}
					if idObj, ok := deckFields["id"].(map[string]interface{}); ok {
						deck.Id, _ = idObj["stringValue"].(string)
					}
					if nameObj, ok := deckFields["name"].(map[string]interface{}); ok {
						deck.Name, _ = nameObj["stringValue"].(string)
					}
					if deck.Id != "" {
						parsedDecks = append(parsedDecks, deck)
					}
				}
				if len(parsedDecks) > 0 {
					data.Decks = parsedDecks
				}
			}
		}
	}

	if wordsObj, ok := fields["words"].(map[string]interface{}); ok {
		if mapValue, ok := wordsObj["mapValue"].(map[string]interface{}); ok {
			if wordFields, ok := mapValue["fields"].(map[string]interface{}); ok {
				parsedWords := make(map[string]DictionaryWordState, len(wordFields))
				for wordID, rawWord := range wordFields {
					wordMap, ok := rawWord.(map[string]interface{})
					if !ok {
						continue
					}
					wordValue, ok := wordMap["mapValue"].(map[string]interface{})
					if !ok {
						continue
					}
					wordFieldsMap, ok := wordValue["fields"].(map[string]interface{})
					if !ok {
						continue
					}

					wordState := DictionaryWordState{}
					if srsLevelObj, ok := wordFieldsMap["srsLevel"].(map[string]interface{}); ok {
						if srsLevelStr, ok := srsLevelObj["integerValue"].(string); ok {
							wordState.SrsLevel, _ = strconv.ParseInt(srsLevelStr, 10, 64)
						}
					}
					if nextReviewObj, ok := wordFieldsMap["nextReviewAt"].(map[string]interface{}); ok {
						if nextReviewStr, ok := nextReviewObj["integerValue"].(string); ok {
							wordState.NextReviewAt, _ = strconv.ParseInt(nextReviewStr, 10, 64)
						}
					}
					if deckIdsObj, ok := wordFieldsMap["deckIds"].(map[string]interface{}); ok {
						if arrayVal, ok := deckIdsObj["arrayValue"].(map[string]interface{}); ok {
							if values, ok := arrayVal["values"].([]interface{}); ok {
								wordState.DeckIds = make([]string, 0, len(values))
								for _, value := range values {
									valueMap, ok := value.(map[string]interface{})
									if !ok {
										continue
									}
									if deckID, ok := valueMap["stringValue"].(string); ok && deckID != "" {
										wordState.DeckIds = append(wordState.DeckIds, deckID)
									}
								}
							}
						}
					}

					parsedWords[wordID] = wordState
				}
				data.Words = parsedWords
			}
		}
	}

	return data
}

func (fc *FirestoreClient) loadUserDictionaryData() (DictionaryState, bool, error) {
	docUrl := fmt.Sprintf("%s/userDictionaries/%s", fc.GetBaseUrl(), fc.uid)
	resp, err := fc.doRequest("GET", docUrl, nil)
	if err != nil {
		return defaultDictionaryData(), false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return defaultDictionaryData(), false, nil
	}

	if resp.StatusCode != http.StatusOK {
		body, _ := ioutil.ReadAll(resp.Body)
		return defaultDictionaryData(), false, fmt.Errorf("failed to get user dictionary (status %d): %s", resp.StatusCode, string(body))
	}

	var response map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return defaultDictionaryData(), false, err
	}

	return parseDictionaryData(response), true, nil
}

func (fc *FirestoreClient) saveUserDictionaryData(data DictionaryState) error {
	docUrl := fmt.Sprintf("%s/userDictionaries/%s", fc.GetBaseUrl(), fc.uid)
	u, err := url.Parse(docUrl)
	if err != nil {
		return err
	}
	query := u.Query()
	query.Add("updateMask.fieldPaths", "decks")
	query.Add("updateMask.fieldPaths", "words")
	u.RawQuery = query.Encode()

	body, err := json.Marshal(map[string]interface{}{"fields": encodeDictionaryData(data)})
	if err != nil {
		return err
	}

	resp, err := fc.doRequest("PATCH", u.String(), body)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := ioutil.ReadAll(resp.Body)
		return fmt.Errorf("failed to save dictionary data (status %d): %s", resp.StatusCode, string(bodyBytes))
	}

	return nil
}

func (fc *FirestoreClient) GetUserDictionary() (DictionaryState, error) {
	data, exists, err := fc.loadUserDictionaryData()
	if err != nil {
		return defaultDictionaryData(), err
	}
	normalized, changed := normalizeDictionaryData(data)
	normalized.Decks = sortDictionaryDecks(normalized.Decks)
	if changed || !exists {
		if err := fc.saveUserDictionaryData(normalized); err != nil {
			return defaultDictionaryData(), err
		}
	}
	return normalized, nil
}

func (fc *FirestoreClient) GetDecks() ([]Deck, error) {
	data, err := fc.GetUserDictionary()
	if err != nil {
		return nil, err
	}
	return append([]Deck(nil), data.Decks...), nil
}

func (fc *FirestoreClient) CreateDeck(name string) ([]Deck, error) {
	trimmedName := strings.TrimSpace(name)
	if trimmedName == "" {
		return nil, fmt.Errorf("deck name cannot be empty")
	}

	data, err := fc.GetUserDictionary()
	if err != nil {
		return nil, err
	}

	for _, deck := range data.Decks {
		if strings.EqualFold(deck.Name, trimmedName) {
			return nil, fmt.Errorf("deck name already exists")
		}
	}

	data.Decks = append(data.Decks, Deck{Id: uuid.NewString(), Name: trimmedName})
	data.Decks = sortDictionaryDecks(data.Decks)
	if err := fc.saveUserDictionaryData(data); err != nil {
		return nil, err
	}
	return append([]Deck(nil), data.Decks...), nil
}

func (fc *FirestoreClient) RenameDeck(deckID, name string) ([]Deck, error) {
	trimmedName := strings.TrimSpace(name)
	if trimmedName == "" {
		return nil, fmt.Errorf("deck name cannot be empty")
	}
	if deckID == defaultDeckID {
		return nil, fmt.Errorf("default deck cannot be renamed")
	}

	data, err := fc.GetUserDictionary()
	if err != nil {
		return nil, err
	}

	updated := false
	for i := range data.Decks {
		if data.Decks[i].Id == deckID {
			data.Decks[i].Name = trimmedName
			updated = true
			break
		}
	}
	if !updated {
		return nil, fmt.Errorf("deck not found")
	}
	for _, deck := range data.Decks {
		if deck.Id != deckID && strings.EqualFold(deck.Name, trimmedName) {
			return nil, fmt.Errorf("deck name already exists")
		}
	}

	data.Decks = sortDictionaryDecks(data.Decks)
	if err := fc.saveUserDictionaryData(data); err != nil {
		return nil, err
	}
	return append([]Deck(nil), data.Decks...), nil
}

func (fc *FirestoreClient) DeleteDeck(deckID string) ([]Deck, error) {
	if deckID == defaultDeckID {
		return nil, fmt.Errorf("default deck cannot be deleted")
	}

	data, err := fc.GetUserDictionary()
	if err != nil {
		return nil, err
	}

	filteredDecks := make([]Deck, 0, len(data.Decks)-1)
	deleted := false
	for _, deck := range data.Decks {
		if deck.Id == deckID {
			deleted = true
			continue
		}
		filteredDecks = append(filteredDecks, deck)
	}
	if !deleted {
		return nil, fmt.Errorf("deck not found")
	}

	deckLookup := make(map[string]struct{}, len(filteredDecks))
	for _, deck := range filteredDecks {
		deckLookup[deck.Id] = struct{}{}
	}
	deckLookup[defaultDeckID] = struct{}{}

	for wordID, wordState := range data.Words {
		filteredIDs := make([]string, 0, len(wordState.DeckIds))
		for _, existingDeckID := range wordState.DeckIds {
			if existingDeckID == deckID {
				continue
			}
			if _, exists := deckLookup[existingDeckID]; !exists {
				continue
			}
			filteredIDs = append(filteredIDs, existingDeckID)
		}
		if len(filteredIDs) == 0 {
			filteredIDs = []string{defaultDeckID}
		}
		wordState.DeckIds = filteredIDs
		data.Words[wordID] = wordState
	}

	data.Decks = sortDictionaryDecks(filteredDecks)
	if err := fc.saveUserDictionaryData(data); err != nil {
		return nil, err
	}
	return append([]Deck(nil), data.Decks...), nil
}

// SetWordDeckIds surgically patches only the deckIds field for one word,
// preserving all other SRS fields and avoiding a full map rewrite.
func (fc *FirestoreClient) SetWordDeckIds(wordID string, deckIds []string) error {
	// Validate against current deck list so we reject unknown IDs before writing.
	data, err := fc.GetUserDictionary()
	if err != nil {
		return err
	}

	deckLookup := make(map[string]struct{}, len(data.Decks))
	for _, deck := range data.Decks {
		deckLookup[deck.Id] = struct{}{}
	}

	cleanedIDs := make([]string, 0, len(deckIds)+1)
	seen := make(map[string]struct{}, len(deckIds)+1)
	for _, deckID := range deckIds {
		deckID = strings.TrimSpace(deckID)
		if deckID == "" {
			continue
		}
		if _, exists := deckLookup[deckID]; !exists {
			continue
		}
		if _, exists := seen[deckID]; exists {
			continue
		}
		seen[deckID] = struct{}{}
		cleanedIDs = append(cleanedIDs, deckID)
	}
	if len(cleanedIDs) == 0 {
		cleanedIDs = []string{defaultDeckID}
	} else if _, exists := seen[defaultDeckID]; !exists {
		cleanedIDs = append([]string{defaultDeckID}, cleanedIDs...)
	}

	// Surgical PATCH — only update words.<wordID>.deckIds, leave SRS fields untouched.
	docUrl := fmt.Sprintf("%s/userDictionaries/%s", fc.GetBaseUrl(), fc.uid)
	u, err := url.Parse(docUrl)
	if err != nil {
		return err
	}
	q := u.Query()
	escapedWordId := escapeFieldPathSegment(wordID)
	q.Add("updateMask.fieldPaths", fmt.Sprintf("words.%s.deckIds", escapedWordId))
	u.RawQuery = q.Encode()

	deckIdValues := make([]interface{}, 0, len(cleanedIDs))
	for _, deckID := range cleanedIDs {
		deckIdValues = append(deckIdValues, map[string]interface{}{"stringValue": deckID})
	}

	payload := map[string]interface{}{
		"fields": map[string]interface{}{
			"words": map[string]interface{}{
				"mapValue": map[string]interface{}{
					"fields": map[string]interface{}{
						wordID: map[string]interface{}{
							"mapValue": map[string]interface{}{
								"fields": map[string]interface{}{
									"deckIds": map[string]interface{}{
										"arrayValue": map[string]interface{}{"values": deckIdValues},
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

	resp, err := fc.doRequest("PATCH", u.String(), body)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := ioutil.ReadAll(resp.Body)
		return fmt.Errorf("failed to patch word deck ids (status %d): %s", resp.StatusCode, string(bodyBytes))
	}

	return nil
}

const FirebaseApiKey = "AIzaSyA2MKBe2T3kuaPtHSpze2Dsq3VRmbnfqTo"

type FirestoreClient struct {
	idToken          string
	refreshToken     string
	uid              string
	useEmulator      bool
	emulatorHost     string
	onTokenRefreshed func(newIdToken, newRefreshToken string)
}

func NewFirestoreClient(idToken, refreshToken, uid string, useEmulator bool, emulatorHost string, onTokenRefreshed func(newIdToken, newRefreshToken string)) *FirestoreClient {
	if emulatorHost == "" {
		emulatorHost = "127.0.0.1"
	}
	return &FirestoreClient{
		idToken:          idToken,
		refreshToken:     refreshToken,
		uid:              uid,
		useEmulator:      useEmulator,
		emulatorHost:     emulatorHost,
		onTokenRefreshed: onTokenRefreshed,
	}
}

// GetDocumentResourceName returns a fully qualified resource name for a document
func (fc *FirestoreClient) GetDocumentResourceName(collection, docId string) string {
	dbId := ProdDatabaseId
	if fc.useEmulator {
		dbId = EmulatorDatabaseId
	}
	return fmt.Sprintf("projects/%s/databases/%s/documents/%s/%s", ProjectId, dbId, collection, docId)
}


type RefreshResponse struct {
	ExpiresIn    string `json:"expires_in"`
	TokenType    string `json:"token_type"`
	RefreshToken string `json:"refresh_token"`
	IdToken      string `json:"id_token"`
	UserId       string `json:"user_id"`
	ProjectId    string `json:"project_id"`
}

// RefreshToken exchanges the refresh token for a new idToken
func (fc *FirestoreClient) RefreshToken() (string, error) {
	if fc.refreshToken == "" {
		return "", fmt.Errorf("no refresh token available")
	}

	if fc.useEmulator {
		return fc.idToken, nil
	}

	tokenUrl := fmt.Sprintf("https://securetoken.googleapis.com/v1/token?key=%s", FirebaseApiKey)
	
	data := url.Values{}
	data.Set("grant_type", "refresh_token")
	data.Set("refresh_token", fc.refreshToken)

	resp, err := http.PostForm(tokenUrl, data)
	if err != nil {
		return "", fmt.Errorf("failed to make token refresh request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := ioutil.ReadAll(resp.Body)
		return "", fmt.Errorf("token refresh API returned status %d: %s", resp.StatusCode, string(body))
	}

	var refreshRes RefreshResponse
	if err := json.NewDecoder(resp.Body).Decode(&refreshRes); err != nil {
		return "", fmt.Errorf("failed to decode refresh response: %v", err)
	}

	if refreshRes.IdToken == "" {
		return "", fmt.Errorf("refresh response contained empty ID token")
	}

	// Update cached tokens
	fc.idToken = refreshRes.IdToken
	if refreshRes.RefreshToken != "" {
		fc.refreshToken = refreshRes.RefreshToken
	}

	// Propagate back to parent if callback registered
	if fc.onTokenRefreshed != nil {
		fc.onTokenRefreshed(fc.idToken, fc.refreshToken)
	}

	return fc.idToken, nil
}

// doRequest executes an HTTP request, and if it receives a 401 Unauthorized status,
// it refreshes the token once and retries the request before returning the response.
func (fc *FirestoreClient) doRequest(method, url string, body []byte) (*http.Response, error) {
	req, err := fc.GetRequest(method, url, body)
	if err != nil {
		return nil, err
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}

	// If we got 401 Unauthorized or 403 Forbidden in production, try to refresh the token and retry once.
	// Note: Firestore REST API returns 403 Forbidden (PERMISSION_DENIED) instead of 401 when the ID token is expired
	// because security rules (e.g. checking request.auth != null) fail due to an invalid/nil auth context.
	if !fc.useEmulator && (resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden) && fc.refreshToken != "" {
		resp.Body.Close() // Close the current unauthorized/forbidden body

		fmt.Printf("[FirestoreClient] %d response received (likely expired/invalid token). Attempting token refresh...\n", resp.StatusCode)
		if _, refreshErr := fc.RefreshToken(); refreshErr != nil {
			return nil, fmt.Errorf("failed to refresh token after %d: %v", resp.StatusCode, refreshErr)
		}

		// Recreate the request with the new token
		req, err = fc.GetRequest(method, url, body)
		if err != nil {
			return nil, err
		}

		fmt.Println("[FirestoreClient] Retrying request with fresh token...")
		resp, err = client.Do(req)
		if err != nil {
			return nil, err
		}
	}

	return resp, nil
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

	resp, err := fc.doRequest("POST", queryUrl, body)
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

		wordAudioUrlVal := ""
		if obj, exists := fields["wordAudioUrl"].(map[string]interface{}); exists {
			wordAudioUrlVal, _ = obj["stringValue"].(string)
		}

		wordTeacherAudioUrlVal := ""
		if obj, exists := fields["wordTeacherAudioUrl"].(map[string]interface{}); exists {
			wordTeacherAudioUrlVal, _ = obj["stringValue"].(string)
		}

		words = append(words, Word{
			Id:                  wordId,
			Dutch:               dutchVal,
			English:             englishVal,
			Context:             contextVal,
			AddedAt:             addedAtVal,
			CreatorId:           creatorIdVal,
			Examples:            examplesList,
			WordAudioUrl:        wordAudioUrlVal,
			WordTeacherAudioUrl: wordTeacherAudioUrlVal,
		})
	}

	return words, nil
}

// GetWordsByIds fetches word documents for the specified word IDs in chunks of 100
func (fc *FirestoreClient) GetWordsByIds(wordIds []string) ([]Word, error) {
	if len(wordIds) == 0 {
		return []Word{}, nil
	}

	var allWords []Word
	const chunkSize = 500

	for i := 0; i < len(wordIds); i += chunkSize {
		end := i + chunkSize
		if end > len(wordIds) {
			end = len(wordIds)
		}
		chunk := wordIds[i:end]

		docNames := make([]string, len(chunk))
		for idx, id := range chunk {
			docNames[idx] = fc.GetDocumentResourceName("words", id)
		}

		payload := map[string]interface{}{
			"documents": docNames,
		}

		bodyBytes, err := json.Marshal(payload)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal batchGet payload: %v", err)
		}

		url := fmt.Sprintf("%s:batchGet", fc.GetBaseUrl())
		resp, err := fc.doRequest("POST", url, bodyBytes)
		if err != nil {
			return nil, fmt.Errorf("batchGet request failed: %v", err)
		}

		if resp.StatusCode != http.StatusOK {
			body, _ := ioutil.ReadAll(resp.Body)
			resp.Body.Close()
			return nil, fmt.Errorf("batchGet API returned status %d: %s", resp.StatusCode, string(body))
		}

		var batchResults []BatchGetResult
		decodeErr := json.NewDecoder(resp.Body).Decode(&batchResults)
		resp.Body.Close()
		if decodeErr != nil {
			return nil, fmt.Errorf("failed to decode batchGet response: %v", decodeErr)
		}

		for _, res := range batchResults {
			if res.Found != nil {
				name := res.Found.Name
				wordId := ""
				for k := len(name) - 1; k >= 0; k-- {
					if name[k] == '/' {
						wordId = name[k+1:]
						break
					}
				}
				if wordId != "" {
					word := parseWordFromFields(wordId, res.Found.Fields)
					allWords = append(allWords, word)
				}
			}
		}
	}

	return allWords, nil
}

// UpdateWordSRS updates nested word SRS fields in userDictionaries/{uid} using patch update masks.
// If the document does not exist (HTTP 404), it intercepts the error and initializes the user's dictionary.
func (fc *FirestoreClient) UpdateWordSRS(wordId string, srsLevel int, nextReviewAt int64) error {
	baseUrl := fc.GetBaseUrl()
	docUrl := fmt.Sprintf("%s/userDictionaries/%s", baseUrl, fc.uid)

	// Format nested field update masks
	u, err := url.Parse(docUrl)
	if err != nil {
		return err
	}
	q := u.Query()
	escapedWordId := escapeFieldPathSegment(wordId)
	q.Add("updateMask.fieldPaths", fmt.Sprintf("words.%s.srsLevel", escapedWordId))
	q.Add("updateMask.fieldPaths", fmt.Sprintf("words.%s.nextReviewAt", escapedWordId))
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

	resp, err := fc.doRequest("PATCH", u.String(), body)
	if err != nil {
		return err
	}

	if resp.StatusCode == http.StatusNotFound {
		resp.Body.Close()

		fmt.Printf("[FirestoreClient] Dictionary document not found for user %s. Initializing...\n", fc.uid)

		// Fallback PATCH payload to initialize the document with empty seenWords and first word's SRS
		fallbackPayload := map[string]interface{}{
			"fields": map[string]interface{}{
				"decks": map[string]interface{}{
					"arrayValue": map[string]interface{}{
						"values": []interface{}{
							map[string]interface{}{
								"mapValue": map[string]interface{}{
									"fields": map[string]interface{}{
										"id": map[string]interface{}{"stringValue": defaultDeckID},
										"name": map[string]interface{}{"stringValue": defaultDeckName},
									},
								},
							},
						},
					},
				},
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
										"deckIds": map[string]interface{}{
											"arrayValue": map[string]interface{}{
												"values": []interface{}{
													map[string]interface{}{"stringValue": defaultDeckID},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				"seenWords": map[string]interface{}{
					"arrayValue": map[string]interface{}{
						"values": []interface{}{},
					},
				},
			},
		}

		fallbackBody, err := json.Marshal(fallbackPayload)
		if err != nil {
			return err
		}

		// Send PATCH without any query params (no updateMask)
		fallbackResp, err := fc.doRequest("PATCH", docUrl, fallbackBody)
		if err != nil {
			return fmt.Errorf("fallback initialization request failed: %v", err)
		}
		defer fallbackResp.Body.Close()

		if fallbackResp.StatusCode != http.StatusOK {
			fallbackBodyBytes, _ := ioutil.ReadAll(fallbackResp.Body)
			return fmt.Errorf("failed to initialize dictionary document (status %d): %s", fallbackResp.StatusCode, string(fallbackBodyBytes))
		}

		fmt.Printf("[FirestoreClient] Dictionary document successfully initialized for user %s with word %s\n", fc.uid, wordId)
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := ioutil.ReadAll(resp.Body)
		return fmt.Errorf("failed to patch srs metadata (status %d): %s", resp.StatusCode, string(bodyBytes))
	}

	return nil
}

// escapeFieldPathSegment backtick-quotes a Firestore field path segment.
// It escapes any nested backticks or backslashes.
func escapeFieldPathSegment(s string) string {
	var buf bytes.Buffer
	buf.WriteByte('`')
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c == '`' || c == '\\' {
			buf.WriteByte('\\')
		}
		buf.WriteByte(c)
	}
	buf.WriteByte('`')
	return buf.String()
}
