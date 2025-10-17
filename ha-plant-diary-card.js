
/* eslint-disable no-console */
// Register with the Lovelace card picker
window.customCards = window.customCards || [];
window.customCards.push({
    type: "ha-plant-diary-card",
    name: "Plant Diary Card",
    description: "A card to display your plant diary entries and images",
});


class PlantDiaryCard extends HTMLElement {

    config;
    content;
    imageCache = new Map(); // 🔐 store cached image availability

    // required
    setConfig(config) {
        this.config = config;
    }

    set hass(hass) {
        this._hass = hass;

        // done once
        if (!this.innerHTML) {
            // Create the card
            this.innerHTML = `
                <ha-card header="Plant Diary">` +
                this.getStyles() +
                `   <div class="card-actions">
                        <ha-button id="addPlantButton">Add Plant</ha-button>
                    </div>
                    <div class="filter-toggle">
                        <label for="toggleShowDue">Show only plants that need watering</label>
                        <ha-switch id="toggleShowDue"></ha-switch>
                    </div>
                    <div id="plantsOutside" class="card-content"></div>
                    <div id="plantsInside" class="card-content"></div>
                    <div id="modalEditPlant" class="modal">
                        <div id="modalEditPlantBody" class="modal-content"></div>
                    </div>
                </ha-card>
            `;
            this.addPlantButton = this.querySelector('#addPlantButton');
            this.contentPlantsOutside = this.querySelector('#plantsOutside');
            this.contentPlantsInside = this.querySelector('#plantsInside');
            this.modalEditPlant = this.querySelector('#modalEditPlant');
            this.modalEditPlantBody = this.querySelector('#modalEditPlantBody');
            this.querySelector('#toggleShowDue').addEventListener('change', () => {
                this._fireEvent('haptic', 'light');
                this.contentPlantsOutside.innerHTML = this.generatePlantCardContentHTML(false);
                this.contentPlantsInside.innerHTML = this.generatePlantCardContentHTML(true);
            });

            // Add event listener to the add plant button
            this.addPlantButton.onclick = () => {
                this._fireEvent('haptic', 'light');
                this.showPlantEditModal("");
            };

            // Call the service to update the days since watered
            this._hass.callService('plant_diary', 'update_days_since_watered');
        }

        // Set the inner HTML of the content div to the generated HTML
        this.contentPlantsOutside.innerHTML = this.generatePlantCardContentHTML(false);
        this.contentPlantsInside.innerHTML = this.generatePlantCardContentHTML(true);

        // Add event listener to the plant card
        this.querySelectorAll('.plant-diary-entity').forEach((el) => {
            el.addEventListener('click', (event) => {
                this._fireEvent('haptic', 'light');
                const entityId = el.dataset.entityId;
                this.showPlantEditModal(entityId);
            });
        });


        // Show modal for adding or editing a plant
        this.showPlantEditModal = (entityId) => {

            // Create a new plant if entityId is empty
            if (entityId === "") {
                const attributes = {
                    plant_name: 'New Plant',
                    last_watered: 'Unknown',
                    last_fertilized: 'Unknown',
                    watering_interval: '14',
                    watering_postponed: '0',
                    inside: false
                };

                // Set the modal content
                this.modalEditPlantBody.innerHTML =
                    this.generateModalEditPlantBodyHTML("", attributes);

                // On OK call create_plant
                const okButton = this.modalEditPlantBody.querySelector('#ok_button');
                okButton.onclick = () => {
                    this._fireEvent('haptic', 'light');

                    const plantNameInput = this.modalEditPlantBody.querySelector('#plant_name').value;
                    const normalizedNewName = this.normalizeName(plantNameInput);

                    // Verificar si ya existe un nombre de planta con ese valor
                    const existingNames = Object.values(this._hass.states)
                        .filter(entity => entity.entity_id.startsWith("sensor.plant_diary"))
                        .map(entity => entity.attributes.plant_name?.toLowerCase());
                    const normalizedExisting = existingNames.map(n => this.normalizeName(n));

                    if (normalizedExisting.includes(normalizedNewName)) {
                        const errorMessageDiv = this.modalEditPlantBody.querySelector('#error_message');
                        errorMessageDiv.innerText = "A plant with this name already exists.";
                        errorMessageDiv.style.display = "block";
                        return;
                    }

                    // Call the service to add a new plant
                    this._hass.callService('plant_diary', 'create_plant', {
                        plant_name: plantNameInput,
                        last_watered: this.modalEditPlantBody.querySelector('#last_watered').value,
                        last_fertilized: this.modalEditPlantBody.querySelector('#last_fertilized').value,
                        watering_interval: this.modalEditPlantBody.querySelector('#watering_days').value,
                        watering_postponed: this.modalEditPlantBody.querySelector('#watering_postponed').value,
                        inside: this.modalEditPlantBody.querySelector('#inside').checked
                    });
                    // Close the modal
                    this.modalEditPlant.style.display = "none";
                };

            }
            else {
                const state = hass.states[entityId];
                const stateStr = state ? state.state : 'unavailable';
                const attributes = state ? state.attributes : {};

                // Set the modal content
                this.modalEditPlantBody.innerHTML =
                    this.generateModalEditPlantBodyHTML(entityId, attributes);

                // On OK call updateAttributes
                const okButton = this.modalEditPlantBody.querySelector('#ok_button');
                okButton.onclick = () => {
                    this._fireEvent('haptic', 'light');
                    this.updateAttributes(entityId);
                };

                // Add event listeners to the delete button
                const deleteButton = this.modalEditPlantBody.querySelector('.deletePlantButton');
                deleteButton.onclick = () => {
                    this._fireEvent('haptic', 'light');

                    const name = attributes.plant_name || 'Unknown';
                    if (confirm(`Are you sure you want to delete ${name}?`)) {
                        this._hass.callService('plant_diary', 'delete_plant', {
                            plant_id: name
                        });
                        this.modalEditPlant.style.display = "none"; // Close the modal after deletion
                    }
                };
            }

            // Close the modal when the user clicks on <span> (x)
            const modalEditPlantCloseButton = this.modalEditPlantBody.querySelector('#EditPlantClose');
            modalEditPlantCloseButton.onclick = () => {
                this._fireEvent('haptic', 'light');
                this.modalEditPlant.style.display = "none";
            };

            // On Cancel close the modal
            const cancelButton = this.modalEditPlantBody.querySelector('#cancel_button');
            cancelButton.onclick = () => {
                this._fireEvent('haptic', 'light');
                this.modalEditPlant.style.display = "none";
            };

            // Update attributes
            this.modalEditPlantBody.querySelector('#last_watered_btn')
                .addEventListener('click', (e) => {
                    this._fireEvent('haptic', 'light');
                    this.modalEditPlantBody.querySelector('#last_watered').value = this.getTodayDate();
                    this.modalEditPlantBody.querySelector('#watering_postponed').value = 0;
                });
            this.modalEditPlantBody.querySelector('#last_fertilized_btn')
                .addEventListener('click', (e) => {
                    this._fireEvent('haptic', 'light');
                    this.modalEditPlantBody.querySelector('#last_fertilized').value = this.getTodayDate();
                });
            this.modalEditPlantBody.querySelector('#watering_postponed_inc_btn')
                .addEventListener('click', (e) => {
                    this._fireEvent('haptic', 'light');
                    this.modalEditPlantBody.querySelector('#watering_postponed').value = parseInt(this.modalEditPlantBody.querySelector('#watering_postponed').value) + 1;
                });
            this.modalEditPlantBody.querySelector('#watering_postponed_dec_btn')
                .addEventListener('click', (e) => {
                    this._fireEvent('haptic', 'light');
                    this.modalEditPlantBody.querySelector('#watering_postponed').value = parseInt(this.modalEditPlantBody.querySelector('#watering_postponed').value) - 1;
                });
            this.modalEditPlantBody.querySelector('#watering_days_inc_btn')
                .addEventListener('click', (e) => {
                    this._fireEvent('haptic', 'light');
                    this.modalEditPlantBody.querySelector('#watering_days').value = parseInt(this.modalEditPlantBody.querySelector('#watering_days').value) + 1;
                });
            this.modalEditPlantBody.querySelector('#watering_days_dec_btn')
                .addEventListener('click', (e) => {
                    this._fireEvent('haptic', 'light');
                    this.modalEditPlantBody.querySelector('#watering_days').value = parseInt(this.modalEditPlantBody.querySelector('#watering_days').value) - 1;
                });

            this.modalEditPlant.style.display = "block";
        };

        // Update attributes when the user clicks on OK
        this.updateAttributes = (entityId) => {
            const form = this.modalEditPlantBody.querySelector('#editForm');
            if (!form) {
                console.error("Form not found");
                return;
            }

            const plantId = this._hass.states[entityId]?.attributes?.plant_name;
            const insideSwitchModal = this.modalEditPlantBody.querySelector('#inside');
            const insideValueModal = insideSwitchModal.checked;
            
            // Call the service to update the attributes
            this._hass.callService('plant_diary', 'update_plant', {
                plant_id: plantId,
                plant_name: plantId,
                last_watered: form.last_watered.value,
                last_fertilized: form.last_fertilized.value,
                watering_interval: form.watering_days.value,
                watering_postponed: form.watering_postponed.value,
                inside: insideValueModal
            });

            // Close the modal
            this.modalEditPlant.style.display = "none";
        };

        // Attach the showPlantEditModal and updateAttributes functions to the window object to make them accessible
        window.showPlantEditModal = this.showPlantEditModal;
        window.updateAttributes = this.updateAttributes;
    }

    // Helper function to get today's date in "YYYY-MM-DD" format
    getTodayDate() {
        const today = new Date();
        const formattedDate = today.toISOString().split('T')[0]; // "YYYY-MM-DD"
        return formattedDate;
    }

    getBackgroundColor(state) {
        switch (state) {
            case '3':
                return 'rgba(179, 205, 224, 0.3)'; // pastel blue
            case '2':
                return 'rgba(198, 239, 206, 0.3)'; // pastel green
            case '1':
                return 'rgba(255, 229, 180, 0.3)'; // pastel yellow
            case '0':
                return 'rgba(255, 204, 204, 0.3)'; // pastel red
            default:
                return 'rgba(0, 0, 0, 0.25)'; // Default
        }
    }

    // Function to get the image URL for a plant
    getImageUrl(entityId) {
        const state = this._hass.states[entityId];
        const attributes = state ? state.attributes : {};
        const imageUrl = `/local/plant_diary/${attributes.image || 'default_image'}.jpg`;
        return imageUrl;
    }

    // Function to check if an image exists in the cache or fetch it
    checkImageExists(url) {
        if (this.imageCache.has(url)) return this.imageCache.get(url);

        return fetch(url)
            .then(res => {
                const exists = res.ok;
                this.imageCache.set(url, exists);
                return exists;
            })
            .catch(() => {
                this.imageCache.set(url, false);
                return false;
            });
    }

    // Function to normalize the plant name
    normalizeName(name) {
        return String(name)
            .toLowerCase()
            .normalize("NFD")               // separa los acentos
            .replace(/[\u0300-\u036f]/g, "") // elimina los acentos
            .replace(/\s+/g, " ")           // quita espacios múltiples
            .trim();
    }

    // Function to fire an event
    _fireEvent(type, detail, options = {}) {
        const event = new Event(type, {
            bubbles: options.bubbles ?? true,
            cancelable: Boolean(options.cancelable),
            composed: options.composed ?? true,
        });
        event.detail = detail ?? {};
        this.dispatchEvent(event);
    }

    // Function to generate the plant image container HTML
    generatePlantImageContainerHTML(entityId) {
        const localPath = this.getImageUrl(entityId);
        const fullUrl = `${location.origin}${localPath}`;
        const imageExists = this.checkImageExists(fullUrl);

        let htmlContent = `<div class="plant-image-container">`
        if (imageExists) {
            htmlContent += `<img src="${localPath}" alt="Plant Image" class="plant-image">`;
        }
        else {
            htmlContent += `<ha-icon icon="mdi:flower" class="plant-image fallback-icon"></ha-icon>`;
        }
        htmlContent += `</div>`
        return htmlContent;
    }

    // Function to generate the modal content for adding or editing a plant
    generateModalEditPlantBodyHTML(entityId, attributes) {

        const isInside = attributes.inside === true ? 'checked' : '';
        let title = "";
        if (entityId === "") title = "Add New Plant";
        else title = `${attributes.plant_name || 'Unknown'} `;

        // Add the title for the modal
        let content = `
            <div class="modal-header">
                <h2 class="modal-title">` + title + `</h2>
                <span id="EditPlantClose" class="close">&times;</span>
            </div>
        `;

        // Add an error message div
        content += `<div id="error_message" class="error-message"></div>`;

        // Add the content for the modal
        content += '<div class="plant-diary-entity-modal-content">';

        // Add the plant image
        content += this.generatePlantImageContainerHTML(entityId);

        // Add the plant attributes form
        content += `<form id="editForm" class ="editForm">`;

        // If entityId is empty, we are adding a new plant, so we show the name input
        if (entityId === "") {
            content += `
            <div class="modal-attribute">
                <label for="name">Name:</label>
                <input type="text" id="plant_name" name="plant_name" value="${attributes.plant_name || 'Unknown'}"><br>
            </div>
            `;
        }

        // Add the attributes to the form
        content += `
                <div class="modal-attribute">
                    <label for="last_watered">Last Watered:</label>
                    <input type="date" id="last_watered" name="last_watered" value="${attributes.last_watered || 'Unknown'}"><br>
                    <button type="button" id="last_watered_btn">
                        <ha-icon icon="mdi:water"></ha-icon>
                    </button>
                </div>
                <div class="modal-attribute">
                    <label for="last_fertilized">Last Fertilized:</label>
                    <input type="date" id="last_fertilized" name="last_fertilized" value="${attributes.last_fertilized || 'Unknown'}"><br>
                    <button type="button" id="last_fertilized_btn">
                        <ha-icon icon="mdi:food-fork-drink"></ha-icon>
                    </button>
                </div>
                <div class="modal-attribute">
                    <label for="watering_postponed">Watering Postponed:</label>
                    <input type="text" id="watering_postponed" name="watering_postponed" value="${attributes.watering_postponed || '0'}"><br>
                    <button type="button" id="watering_postponed_inc_btn">
                        <ha-icon icon="mdi:sleep"></ha-icon>
                    </button>
                    <button type="button" id="watering_postponed_dec_btn">
                        <ha-icon icon="mdi:sleep-off"></ha-icon>
                    </button>
                </div>
                <div class="modal-attribute">
                    <label for="watering_days">Watering days:</label>
                    <input type="text" id="watering_days" name="watering_days" value="${(attributes.watering_interval) || 'Unknown'}"><br>
                    <button type="button" id="watering_days_inc_btn">
                        <ha-icon icon="mdi:chevron-double-up"></ha-icon>
                    </button>
                    <button type="button" id="watering_days_dec_btn">
                        <ha-icon icon="mdi:chevron-double-down"></ha-icon>
                    </button>
                </div>
                <div class="modal-attribute">
                    <label for="inside">Inside:</label>
                    <ha-switch
                        id="inside"
                        name="inside"
                        ${isInside}
                    ></ha-switch>
                </div>
            </form>
            `
        content += `
            <div class="modal-buttons">
            `
        if (entityId !== "") {
            content += `
                <ha-icon icon="mdi:delete" class="deletePlantButton" title="Delete planta"></ha-icon>`;
        }
         content += `
                <ha-button id="cancel_button">Cancel</ha-button>
                <ha-button id="ok_button">OK</ha-button>
            </div>
        </div>`

        return content;
    }

    generatePlantCardContentHTML(isInside) {

        // generate the plant diary card content
        let htmlContent = '';

        if (isInside) {
            htmlContent += `<ha-markdown-element><h1>Indoor Plants</h1></ha-markdown-element>`;
        } else {
            htmlContent += `<ha-markdown-element><h1>Outdoor Plants</h1></ha-markdown-element>`;
        }

        const showOnlyDue = this.querySelector('#toggleShowDue')?.checked;
        for (const entityId in this._hass.states) {
            // Check if the entity ID starts with 'plant_diary.'
            if (entityId.startsWith('sensor.plant_diary')) {
                const state = this._hass.states[entityId];
                const stateStr = state ? state.state : 'unavailable';
                const attributes = state ? state.attributes : {};

                if (isInside === attributes.inside) {

                    // Check if the plant needs watering
                    const isDue = state.state < 2;
                    if (showOnlyDue && !isDue) continue;

                    const backgroundColor = this.getBackgroundColor(stateStr);

                    // Create the HTML content for each entity
                    // Use the entity ID as the key to access the state and attributes
                    htmlContent += `
                        <div class="plant-diary-entity" style="background-color: ${backgroundColor};" data-entity-id="${entityId}">
                    `;
                    htmlContent += this.generatePlantImageContainerHTML(entityId);
                    htmlContent += `
                        <p class="name">${attributes.plant_name || 'Unknown'}</p>
                        <p class="last_watered">Last Watered: ${attributes.last_watered || 'Unknown'}</p>
                        <p class="last_fertilized">Last Fertilized: ${attributes.last_fertilized || 'Unknown'}</p>
                        <p class="due">Due: ${(parseFloat(attributes.watering_interval) - parseFloat(attributes.days_since_watered))} / ${Math.round(parseFloat(attributes.watering_interval)) || 'Unknown'} days</p>
                        <p class="watering_postponed">Watering Postponed: ${attributes.watering_postponed || '0'}</p>
                    </div>
                    `;
                }
            }
        }
        return htmlContent;
    }

    // Function to get the styles for the card
    getStyles() {
        return `
          <style>
    ha-card {
        display: flex;
        flex-direction: column;
        height: 100%;
        font-family: "Roboto", "Arial", sans-serif;
        background-color: rgba(255, 255, 255, 0.05);
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        padding: 10px;
    }

    .card-actions {
        display: flex;
        justify-content: flex-end;
        margin-bottom: 12px;
    }

    .card-actions ha-button {
        background: transparent;
        border-radius: 8px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        transition: all 0.2s ease-in-out;
        color: var(--primary-text-color);
    }
    .card-actions ha-button:hover {
        background: transparent;
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0,0,0,0.15);
    }

    .filter-toggle {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 10px;
        margin: 0 10px 10px 10px;
        font-size: 0.95rem;
        color: var(--primary-text-color);
    }

    .card-content {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .plant-diary-entity {
        display: grid;
        grid-template-areas:
            "i n delete_btn"
            "i last_watered last_watered"
            "i last_fertilized last_fertilized"
            "i due due"
            "i watering_postponed watering_postponed"
            "i . .";
        grid-template-columns: 100px 1fr auto;
        border-radius: 12px;
        padding: 10px;
        margin-bottom: 14px;
        background-color: rgba(255,255,255,0.08);
        transition: all 0.2s ease;
        cursor: pointer;
        box-shadow: 0 2px 6px rgba(0,0,0,0.08);
    }
    
    .plant-diary-entity .last_fertilized {
        grid-area: last_fertilized;
    }
    .plant-diary-entity .last_watered {
        grid-area: last_watered;
    }
    .plant-diary-entity .watering_postponed {
        grid-area: watering_postponed;
    }
    .plant-diary-entity .due {
        grid-area: due;
    }
    
    .plant-diary-entity:hover {
        box-shadow: 0 6px 12px rgba(0,0,0,0.15);
        transform: translateY(-2px);
    }

    .plant-diary-entity .plant-image-container {
        grid-area: i;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 12px;
        overflow: hidden;
    }

    .plant-diary-entity .plant-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 12px;
    }

    .plant-diary-entity .name {
        grid-area: n;
        font-size: 1.1rem;
        font-weight: 500;
        margin-left: 10px;
        color: var(--primary-text-color);
    }

    .plant-diary-entity p {
        font-size: 0.85rem;
        margin: 2px 0 2px 10px;
        color: var(--secondary-text-color);
    }

    .deletePlantButton {
        grid-area: delete_btn;
        justify-self: end;
        color: rgba(255, 50, 50, 0.7);
        transition: transform 0.2s ease, color 0.2s ease;
        cursor: pointer;
    }
    .deletePlantButton:hover {
        color: red;
        transform: scale(1.2);
    }

    /* Modal overlay */
    
    .modal {
        display: none;
        position: fixed;
        z-index: 999;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        overflow: auto;
        padding-top: 60px;
        background-color: rgba(0,0,0,0.6);
        backdrop-filter: blur(4px);
    }

    /* Modal content */
    .modal-content {
        margin: 5% auto;
        padding: 20px;
        border-radius: 14px;
        width: 90%;
        max-width: 400px;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        gap: 12px;
        box-shadow: 0 8px 20px rgba(0,0,0,0.25);
        background-color: var(--primary-background-color, #fefefe);
        color: var(--primary-text-color, #111);
    }

    .modal-header {
        position: relative;
        text-align: center;
    }
    .modal-title {
        font-size: 1.3rem;
        font-weight: 600;
        margin: 0;
    }
    .close {
        position: absolute;
        top: 50%;
        right: 0;
        transform: translateY(-50%);
        font-size: 28px;
        font-weight: bold;
        cursor: pointer;
    }

    .plant-diary-entity-modal-content {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 100%;
    }

    .plant-diary-entity-modal-content .plant-image-container {
        max-width: 180px;
        max-height: 180px;
        margin: 0 auto 10px auto;
        border-radius: 12px;
        overflow: hidden;
    }

    .plant-diary-entity-modal-content .plant-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 12px;
    }
    
    .modal-content {
        width: 90%;
        max-width: 400px;
        box-sizing: border-box;
        overflow-x: hidden;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .modal-attribute {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin: 5px 0;
        width: 100%;
        box-sizing: border-box;
        flex-wrap: nowrap;
    }
    
    /* Label */
    .modal-attribute label {
        min-width: 120px;
        max-width: 120px;
        font-weight: 500;
        white-space: normal;
        word-break: break-word;
        text-align: left;
        color: var(--primary-text-color);
    }
    
    /* Input / Select / Switch */
    .modal-attribute input,
    .modal-attribute select  {
        flex: 1 1 auto;
        min-width: 60px;
        max-width: 100%;
        padding: 6px 10px;
        border-radius: 6px;
        border: 1px solid var(--divider-color, #ccc);
        font-size: 0.9rem;
        background-color: var(--secondary-background-color, rgba(255,255,255,0.05));
        color: var(--primary-text-color, #111);
        box-sizing: border-box;
    }
    
    .modal-attribute ha-switch {
        flex: 1 1 auto;
        min-width: 60px;
        max-width: 100%;
        padding: 6px 10px;
        border-radius: 6px;
        border: none;
        font-size: 0.9rem;
        background-color: transparent;
        color: var(--primary-text-color, #111);
        box-sizing: border-box;
    }
    
    .modal-attribute button {
        flex: 0 0 auto;
        background-color: #e8e8e8;
        border: none;
        border-radius: 6px;
        padding: 4px;
        cursor: pointer;
        transition: all 0.2s ease;
    }
    
    @media (hover: hover) {
        .modal-attribute button:hover {
            background-color: var(--secondary-background-color, #fff);
            transform: translateY(-1px);
        }
    }
    
    @media (max-width: 360px) {
        .modal-attribute {
            flex-wrap: wrap;
            align-items: flex-start;
        }
    
        .modal-attribute label {
            width: 100%;
        }
    
        .modal-attribute input,
        .modal-attribute select,
        .modal-attribute ha-switch {
            width: 100%;
        }
    }

    /* Button OK / Cancel / Delete */
    .modal-buttons {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 1px;
    }
    
    .modal-buttons ha-button {
        min-width: 100px; 
        border: none;          
        outline: none;          
        border-radius: 8px;     
        padding: 6px 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        background-color: transparent;  
        color: var(--primary-text-color, #111);                 
    }

    .modal-buttons ha-button:hover {
        transform: translateY(-1px);
    }

    /* Delete icon */
    .deletePlantButton {
        cursor: pointer;
        color: rgba(255, 50, 50, 0.7);
        transition: transform 0.2s ease, color 0.2s ease;
    }
    
    .deletePlantButton:hover {
        color: red;
        transform: scale(1.2);
    }

    .error-message {
        color: #c00;
        font-weight: 600;
        text-align: center;
        display: none;
    }

    /* --- DARK MODE --- */
    body.dark-mode, ha-card.dark-mode, .modal-content.dark-mode {
        background-color: #2b2b2b;
        color: #f5f5f5;
    }

    body.dark-mode .modal-attribute input,
    body.dark-mode .modal-attribute select {
        background-color: #3b3b3b;
        color: #f5f5f5;
        border: 1px solid #555;
    }

    body.dark-mode .modal-attribute button,
    body.dark-mode .modal-buttons ha-button {
        background-color: #444;
        color: #f5f5f5;
    }

    body.dark-mode .modal-attribute button:hover,
    body.dark-mode .modal-buttons ha-button:hover {
        background-color: #555;
    }
    .modal-buttons ha-button,
    .modal-attribute button {
        background-color: var(--primary-background-color, #f0f0f0);
        color: var(--primary-text-color, #111);
    }
</style>
`;
    }
}

customElements.define('ha-plant-diary-card', PlantDiaryCard);